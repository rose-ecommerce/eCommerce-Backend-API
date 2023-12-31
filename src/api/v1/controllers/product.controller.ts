import {
  NextFunction,
  Response
} from 'express';
import mongoose, { ClientSession, FilterQuery, Types } from 'mongoose';

import {
  CreateProductDto,
  CustomError,
  CustomSuccess,
  GetUserAuthInfoRequestInterface,
  MAX_IMAGES_PER_PRODUCT,
  Pagination,
  convertStringIdsToObjectId,
  isValidArrayOfStrings,
  createProductImage,
  deleteProductImageFile,
  doesArraysHaveSimilarElements,
  uploadProductImageFile,
  FilterCriteriaDto,
  ProductInterface
} from '../shared';
import {
  ProductImageModel,
  ProductModel
} from '../data-models';


export const createProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  try {
    const productImgFiles = <Array<Express.Multer.File>>req?.files;
    const productData = new CreateProductDto(req.body);

    const product = new ProductModel({
      name: productData.name,
      description: productData.description,
      quantityInStock: productData.quantityInStock,
      category: productData.category,
      isPopular: productData.isPopular,
      price: productData.price,
    });

    if (!Array.isArray(productImgFiles)) {
      throw new Error(`Image files not present.`);
    }

    if (productImgFiles.length > MAX_IMAGES_PER_PRODUCT) {
      throw new Error(`Maximum 3 images per product.`);
    }
    
    for (let file of productImgFiles) {
      const productImgId = await createProductImage(file, product._id, session);
      product.images?.push(productImgId);
    }

    for (let productId of <Array<Types.ObjectId>>productData.similarProducts) {
      const similarProduct = await ProductModel.findById(productId);
      if (!similarProduct) {
        throw new Error(`Product with id ${productId} from similar product array not found`);
      }
      product.similarProducts.push(productId);
      similarProduct.similarProducts.push(product._id);
      similarProduct.save({ session });
    }

    await product.save({ session });
    await session.commitTransaction();

    for (let file of productImgFiles) {
      await uploadProductImageFile(file);
    }

    await session.endSession();
    return next(new CustomSuccess(product, 200));

  } catch (error: any) {
    await session.abortTransaction();
    await session.endSession();
    return next(new CustomError(error.message, 400));
  }
};

export const getProducts = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const {
      page,
      size,
      category,
      isPopular,
      search
    } = new FilterCriteriaDto(req.query);

    const filterQueryList: Array<FilterQuery<ProductInterface>> = [];

    if (category) {
      filterQueryList.push({ category });
    }

    if (typeof isPopular === 'boolean') {
      filterQueryList.push({ isPopular });
    }

    if (typeof search === 'string' && search.length > 0) {
      filterQueryList.push({ name: { $regex: search, $options: 'i' } });
    }


    let totalElements: number;
    let totalPages: number;
    let products;

    if (filterQueryList.length > 0) {
      totalElements = await ProductModel.countDocuments({
        $and: filterQueryList
      });
  
      totalPages = Math.floor(totalElements / size);
      if ((totalElements % size) > 0) {
        totalPages += 1;
      }
  
      products = await ProductModel
        .find({
          $and: filterQueryList
        })
        .skip(page * size)
        .limit(size)
        .populate('images');
    } else {
      totalElements = await ProductModel.countDocuments();
  
      totalPages = Math.floor(totalElements / size);
      if ((totalElements % size) > 0) {
        totalPages += 1;
      }
  
      products = await ProductModel
        .find()
        .skip(page * size)
        .limit(size)
        .populate('images');
    }

    const pagination = new Pagination(
      products,
      totalElements,
      totalPages,
      page,
      size
    );

    return next(new CustomSuccess(pagination, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const getProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const product = await ProductModel
      .findById(productId)
      .populate('images');

    if (!product) {
      throw new Error(`Product with id ${productId} not found.`);
    }
    return next(new CustomSuccess(product, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const getProductsWithIds = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {

    if (!req.body) {
      throw new Error(`Array of product ids not present`);
    }

    if (!isValidArrayOfStrings(req.body)) {
      throw new Error(`Invalid array of product ids`)
    }
    const productIds = convertStringIdsToObjectId(req.body);

    const products: Array<any> = [];

    for (let productId of productIds) {
      const product = await ProductModel.findById(productId)
        .populate('images');

      if (!product) {
        throw new Error(`Product with id ${productId} doesn't exist`);
      }

      products.push(product);
    }

    
    return next(new CustomSuccess(products, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const addNewImageOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  try {
    const productImgFile = <Express.Multer.File>req?.file;
    const { productId } = req.params;

    const product = await ProductModel
      .findById(productId)
      .populate('images');

    if (!productImgFile) {
      throw new Error(`Image not uploaded.`);
    }

    if (!product) {
      throw new Error(`Product with id ${productId} not found`);
    }

    if (!(<number>product.images?.length < MAX_IMAGES_PER_PRODUCT)) {
      throw new Error(`Already ${MAX_IMAGES_PER_PRODUCT} images for product present. Delete some image.`);
    }
    
    const productImgId = await createProductImage(productImgFile, product._id, session);
    product.images?.push(productImgId);

    await product.save({ session });
    await session.commitTransaction();

    await uploadProductImageFile(productImgFile);

    await session.endSession();
    return next(new CustomSuccess(product, 200));

  } catch (error: any) {
    await session.abortTransaction();
    await session.endSession();
    return next(new CustomError(error.message, 400));
  }
};

export const deleteImageOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productId, imageId } = req.params;

    const product = await ProductModel
      .findById(productId)
      .populate('images');

    const image  = await ProductImageModel.findById(imageId);

    const imagePath = <string>image?.url;

    if (!product) {
      throw new Error(`Product with id ${productId} not found`);
    }

    if (!image) {
      throw new Error(`Image with id ${imageId} not found`);
    }

    const indexOfImage = <number>product.images?.indexOf(image._id);

    if (indexOfImage < 0) {
      throw new Error(`Image with id ${imageId} does not belong to product with id ${productId}`);
    }

    product.images?.splice(indexOfImage, 1);

    await image.deleteOne({ session });
    await product.save({ session });
    await session.commitTransaction();

    await deleteProductImageFile(imagePath);

    await session.endSession();
    return next(new CustomSuccess(product, 200));

  } catch (error: any) {
    await session.abortTransaction();
    await session.endSession();
    return next(new CustomError(error.message, 400));
  }
};

export const rearrangeImagesOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const rearrangedImages: Array<string> = req.body;

    const product = await ProductModel
      .findById(productId)
      .populate('images');

    if (!product) {
      throw new Error(`Product with id ${productId} not found`);
    }

    if (!(rearrangedImages &&
        Array.isArray(rearrangedImages) &&
        rearrangedImages.every(imgId => typeof imgId === 'string'))) {
      throw new Error(`Payload must be an array of strings`);
    }

    if (!doesArraysHaveSimilarElements(
      rearrangedImages,
      <Array<any>>product.images?.map(imgId => imgId.toString())
    )) {
      throw new Error(`Images are different`);
    }

    product.images = rearrangedImages.map(imgId => new Types.ObjectId(imgId));;

    await product.save();
    return next(new CustomSuccess(product, 200));

  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  }
};

export const editNameOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const newProductName = req.body.name;

    if (!newProductName) {
      throw new Error(`New product name not present`);
    }

    const product = await ProductModel
      .findById(productId)
      .populate('images');

    if (!product) {
      throw new Error(`Product with id ${productId} not found.`);
    }

    product.name = newProductName;
    await product.save();
    return next(new CustomSuccess(product, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const editQuantityOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const newProductQuantity = req.body.quantityInStock;

    if (!newProductQuantity) {
      throw new Error(`New product quantity not present`);
    }

    const product = await ProductModel
      .findById(productId)
      .populate('images');

    if (!product) {
      throw new Error(`Product with id ${productId} not found.`);
    }

    product.quantityInStock = newProductQuantity;
    await product.save();
    return next(new CustomSuccess(product, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const editDescriptionOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const newProductDescription = req.body.description;

    if (!newProductDescription) {
      throw new Error(`New product description not present`);
    }

    const product = await ProductModel
      .findById(productId)
      .populate('images');

    if (!product) {
      throw new Error(`Product with id ${productId} not found.`);
    }

    product.description = newProductDescription;
    await product.save();
    return next(new CustomSuccess(product, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const editCategoryOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;
    const newProductCategory = req.body.category;

    if (!newProductCategory) {
      throw new Error(`New product category not present`);
    }

    const product = await ProductModel
      .findById(productId)
      .populate('images');

    if (!product) {
      throw new Error(`Product with id ${productId} not found.`);
    }

    product.category = newProductCategory;
    await product.save();
    return next(new CustomSuccess(product, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const editSimilarProductsOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  session.startTransaction();
  try {
    const { productId } = req.params;

    if (!req.body) {
      throw new Error(`Array of new similar products not present`);
    }

    if (!isValidArrayOfStrings(req.body)) {
      throw new Error(`Invalid array of new similar products`)
    }
    const newSimilarProductList = convertStringIdsToObjectId(req.body);

    const product = await ProductModel
      .findById(productId)
      .populate('images');

    if (!product) {
      throw new Error(`Product with id ${productId} not found.`);
    }

    const removeSimilarProductIds = product.similarProducts.filter(oldProductId => {
      return !newSimilarProductList.some(newProductId => newProductId.equals(oldProductId));
    });

    const addSimilarProductIds = newSimilarProductList.filter(newProductId => {
      return !product.similarProducts.some(oldProductId => oldProductId.equals(newProductId));
    });

    for (let productId of removeSimilarProductIds) {
      const oldSimilarProduct = (await ProductModel.findById(productId));
      if (oldSimilarProduct) {
        product.similarProducts = product.similarProducts.filter(id => !id.equals(productId));
        oldSimilarProduct.similarProducts = oldSimilarProduct.similarProducts.filter(id => !id.equals(product._id));
        oldSimilarProduct?.save({ session });
      }
    }

    for (let productId of addSimilarProductIds) {
      if (product._id.equals(productId)) {
        throw new Error(`Cannot add product itself as a similar product`);
      }
      const newSimilarProduct = await ProductModel.findById(productId);
      if (!newSimilarProduct) {
        throw new Error(`Product with id ${productId} from similar product array not found`);
      }
      product.similarProducts.push(productId);
      newSimilarProduct.similarProducts.push(product._id);
      newSimilarProduct.save({ session });
    }

    await product.save({ session });
    await session.commitTransaction();
    await session.endSession();
    return next(new CustomSuccess(product, 200));
  } catch (error: any) {
    await session.abortTransaction();
    await session.endSession();
    return next(new CustomError(error.message, 500));
  }
};
