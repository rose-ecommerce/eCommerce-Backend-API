import sharp from 'sharp';
import path from 'path';
import {
  existsSync
} from 'fs';
import {
  ClientSession,
  Types
} from 'mongoose';
import {
  mkdir,
  unlink,
  writeFile
} from 'fs/promises';

import {
  ProductImageModel
} from '../../data-models';
import {
  ACCEPTED_IMG_EXTENSIONS,
  AWS_PRODUCT_IMG_FOLDER_NAME,
  EnvironmentInterface,
  PRODUCT_IMG_UPLOAD_PATH,
  ProductImageDocument,
  ProductImageStorageLocation,
  TARGETED_IMG_SIZE 
} from '..';
import {
  s3
} from '../../../../config';

/**
 * Create image in the database.
 * @param imgFile
 * @param productId
 * @param session 
 */
export const createProductImage = async (imgFile: Express.Multer.File,
                                         productId: Types.ObjectId,
                                         s3: boolean,
                                         session: ClientSession): Promise<ProductImageDocument> => {
  if (!imgFile) {
    throw new Error('File is not attached.')
  }

  const [imgType, imgExtension] = imgFile.mimetype.split('/');

  if (imgType !== 'image') {
    throw new Error('Only image as a file is accepted.')
  }

  if (!ACCEPTED_IMG_EXTENSIONS.includes(imgExtension)) {
    throw new Error(`${ACCEPTED_IMG_EXTENSIONS.join(', ')} are the only accepted image formats.`);
  }

  const productImg = new ProductImageModel();

  // ! EDITING ARGUMENT DIRECTLY (CALL BY REFERENCE)
  imgFile.originalname = `product_${productId}_img_${productImg._id}.${imgExtension}`;

  if (!s3) {
    // * STORING LOCALLY
    productImg.storageLocation = ProductImageStorageLocation.LOCAL;
    productImg.url = `/uploads/${imgFile.originalname}`;
  } else {
    // * STORING IN S3
    const { AWS_S3_BUCKET_NAME } = process.env as unknown as EnvironmentInterface;
    productImg.storageLocation = ProductImageStorageLocation.AWS;
    productImg.url = `https://${AWS_S3_BUCKET_NAME}.s3.amazonaws.com/${AWS_PRODUCT_IMG_FOLDER_NAME}/${imgFile.originalname}`;
  }



  await productImg.save({ session });
  return productImg;
}

/**
 * Save image into the local folder.
 * @param imgFile 
 */
export const uploadProductImageFileInLocal = async (imgFile: Express.Multer.File): Promise<void> => {
  const UPLOAD_DIRECTORY_PATH = path.join(PRODUCT_IMG_UPLOAD_PATH, 'uploads');
  const imgPath = path.join(UPLOAD_DIRECTORY_PATH,  imgFile.originalname);

  if (!existsSync(UPLOAD_DIRECTORY_PATH)) {
    await mkdir(UPLOAD_DIRECTORY_PATH, { recursive: true })
  }

  if (imgFile.size > TARGETED_IMG_SIZE) {

    // ! EDITING ARGUMENT DIRECTLY (CALL BY REFERENCE)
    imgFile = await compressImage(imgFile, TARGETED_IMG_SIZE);
  }

  await writeFile(imgPath, imgFile.buffer);
};

/**
 * Save image to s3 bucket.
 * @param imgFile 
 */
export const uploadProductImageFileInS3 = async (imgFile: Express.Multer.File): Promise<void> => {

  if (imgFile.size > TARGETED_IMG_SIZE) {

    // ! EDITING ARGUMENT DIRECTLY (CALL BY REFERENCE)
    imgFile = await compressImage(imgFile, TARGETED_IMG_SIZE);
  }

  const { AWS_S3_BUCKET_NAME } = process.env as unknown as EnvironmentInterface;
  const objectKey: string = `${AWS_PRODUCT_IMG_FOLDER_NAME}/${imgFile.originalname}`;

  await s3.upload({
    Bucket: AWS_S3_BUCKET_NAME,
    Key: objectKey,
    Body: imgFile.buffer,
    ContentType: imgFile.mimetype,
    ACL: 'public-read',
  }).promise();
};

/**
 * 
 * @param imageFilePath 
 */
export const deleteProductImageFileFromLocal = async (relativeImgPath: string): Promise<void> => {
  try {
    const absoluteImgPath = path.join(PRODUCT_IMG_UPLOAD_PATH,  relativeImgPath);
    await unlink(absoluteImgPath);
  } catch (error) {
    throw new Error(`Error deleting image.`);
  }
}

/**
 * 
 * @param imageFilePath 
 */
export const deleteProductImageFileFromS3 = async (imgUrl: string): Promise<void> => {
  const { AWS_S3_BUCKET_NAME } = process.env as unknown as EnvironmentInterface;
  const objectKey = imgUrl.replace(`https://${AWS_S3_BUCKET_NAME}.s3.amazonaws.com/`, '');

  try {
    await s3.deleteObject({
      Bucket: AWS_S3_BUCKET_NAME,
      Key: objectKey
    }).promise();
  } catch (error) {
    throw new Error(`Error deleting image.`);
  }
}

/**
 * Compress image under the size of 100 KB
 * @param imgFile 
 * @param targetSize 
 * @returns 
 */
export const compressImage = async (imgFile: Express.Multer.File, targetSize: number): Promise<Express.Multer.File> => {
  try {
    let quality = 100;
    do {
      const img = sharp(imgFile.buffer);
      const imgWidth = (await img.metadata()).width;
      const currentSize = imgFile.size;
      const scaleFactor = Math.sqrt(targetSize / currentSize);
      imgFile.buffer = await img.resize(Math.round(<number>imgWidth * scaleFactor))
        .jpeg({ quality })
        .toBuffer();
      imgFile.size = Buffer.byteLength(imgFile.buffer);
      if (imgFile.size <= targetSize) {
        return imgFile;
      }
      quality -= 1;
    } while (quality >= 10);
    return imgFile;
    
  } catch (error) {
    throw error;
  }
};
