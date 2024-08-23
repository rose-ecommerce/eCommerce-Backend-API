import {
  NextFunction,
  Response
} from 'express';
import mongoose, {
  ClientSession,
  FilterQuery,
  Types
} from 'mongoose';

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
  deleteProductImageFileFromLocal,
  doesArraysHaveSimilarElements,
  uploadProductImageFileInLocal,
  EditProductBasicDetailsDto,
  merge,
  ProductDocument,
  MIN_IMAGES_PER_PRODUCT,
  ProductImageDocument,
  ProductFilterCriteriaDto,
  isSortStringValid,
  PRODUCT_SORTABLE_COLUMNS,
  retrieveSortInfo,
  SortDirection,
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  uploadProductImageFileInS3,
  deleteProductImageFileFromS3
} from '../shared';
import {
  ProductImageModel,
  ProductModel
} from '../data-models';

export const createProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const productImgFiles = <Array<Express.Multer.File>>req?.files;
      const productData = new CreateProductDto(req.body);

      const product: ProductDocument = new ProductModel({
        name: productData.name,
        description: productData.description,
        quantityInStock: productData.quantityInStock,
        category: productData.category,
        isPinned: productData.isPinned,
        maxRetailPrice: productData.maxRetailPrice,
        sellingPrice: productData.sellingPrice,
        customizationTextRange: productData.customizationTextRange
      });

      if (!Array.isArray(productImgFiles) ||
          productImgFiles.length < MIN_IMAGES_PER_PRODUCT) {
        throw new Error(`Minimum 1 image per product req`);
      }

      if (productImgFiles.length > MAX_IMAGES_PER_PRODUCT) {
        throw new Error(`Maximum 3 images per product.`);
      }

      const createProductImages: Array<Promise<any>> = productImgFiles.map(async (file) => {
        const productImgId = await createProductImage(
          file,
          product._id,
          false,
          session
        );
        (product.images as unknown as Array<ProductImageDocument>)?.push(productImgId);
      })

      const assignSimilarProducts: Array<Promise<any>> = productData.similarProducts.map(async (productId) => {
        const similarProduct = await ProductModel.findById(productId);
        if (!similarProduct) {
          throw new Error(`Product with id ${productId} from similar product array not found`);
        }
        product.similarProducts.push(productId);
        similarProduct.similarProducts.push(product._id);
        await similarProduct.save({ session });
      });

      await Promise.all(<Array<Promise<any>>>[
        ...createProductImages,
        ...assignSimilarProducts
      ]);

      await product.save({ session });

      // * STORING LOCALLY
      await Promise.all(productImgFiles.map(uploadProductImageFileInLocal));

      return next(new CustomSuccess(product, 200));
    });
  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  } finally {
    await session.endSession();
  }
};

export const createProductS3 = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const productImgFiles = <Array<Express.Multer.File>>req?.files;
      const productData = new CreateProductDto(req.body);

      const product = new ProductModel({
        name: productData.name,
        description: productData.description,
        quantityInStock: productData.quantityInStock,
        category: productData.category,
        isPinned: productData.isPinned,
        maxRetailPrice: productData.maxRetailPrice,
        sellingPrice: productData.sellingPrice,
        customizationTextRange: productData.customizationTextRange
      });

      if (!Array.isArray(productImgFiles) ||
          productImgFiles.length < MIN_IMAGES_PER_PRODUCT) {
        throw new Error(`Minimum 1 image per product req`);
      }

      if (productImgFiles.length > MAX_IMAGES_PER_PRODUCT) {
        throw new Error(`Maximum 3 images per product.`);
      }

      const createProductImages: Array<Promise<any>> = productImgFiles.map(async (file) => {
        const productImgId = await createProductImage(
          file,
          product._id,
          true,
          session
        );
        (product.images as unknown as Array<ProductImageDocument>)?.push(productImgId);
      })

      const assignSimilarProducts: Array<Promise<any>> = productData.similarProducts.map(async (productId) => {
        const similarProduct = await ProductModel.findById(productId);
        if (!similarProduct) {
          throw new Error(`Product with id ${productId} from similar product array not found`);
        }
        product.similarProducts.push(productId);
        similarProduct.similarProducts.push(product._id);
        await similarProduct.save({ session });
      });

      await Promise.all(<Array<Promise<any>>>[
        ...createProductImages,
        ...assignSimilarProducts
      ]);

      await product.save({ session });

      // * STORING IN S3
      await Promise.all(productImgFiles.map(uploadProductImageFileInS3));

      return next(new CustomSuccess(product, 200));
    });
  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  } finally {
    await session.endSession();
  }
};

export const getProducts = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const {
      page,
      size,
      sort,
      category,
      isPinned,
      search,
    } = new ProductFilterCriteriaDto(req.query);

    const filterQuery: FilterQuery<ProductDocument> = {};
    const $andFilterQueryList: Array<FilterQuery<ProductDocument>> = [];
    let sortColumn: string = DEFAULT_SORT_COLUMN;
    let sortDirection: SortDirection = DEFAULT_SORT_DIRECTION;

    if (category) {
      $andFilterQueryList.push({ category });
    }

    if (typeof isPinned === 'boolean') {
      $andFilterQueryList.push({ isPinned });
    }

    if (typeof search === 'string' && search.length > 0) {
      $andFilterQueryList.push({ name: { $regex: search, $options: 'i' } });
    }

    if (typeof sort === 'string' && sort.length > 0) {
      if (isSortStringValid(sort, PRODUCT_SORTABLE_COLUMNS)) {
        ({ sortColumn, sortDirection } = retrieveSortInfo(sort));
      } else {
        throw new Error(`Sort string is of invalid format.`);
      }
    }

    if ($andFilterQueryList.length > 0) {
      filterQuery['$and'] = $andFilterQueryList;
    }

    const [ totalElements, products ] = await Promise.all(<Array<Promise<any>>>[
      ProductModel.countDocuments(filterQuery),
      ProductModel
        .find(filterQuery)
        .skip(page * size)
        .limit(size)
        .sort({
          [sortColumn]: sortDirection
        })
        .populate('images')
    ]);

    let totalPages = Math.floor(totalElements / size);
    if ((totalElements % size) > 0) {
      totalPages += 1;
    }

    const pagination = new Pagination(
      products,
      totalElements,
      totalPages,
      page,
      size,
      sortColumn,
      sortDirection
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

    await Promise.all(
      productIds.map(async (productId) => {
        const product = await ProductModel.findById(productId)
          .populate('images');
  
        if (product) {
          products.push(product);
        }
      })
    );
    
    return next(new CustomSuccess(products, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const addNewImageOfProductInLocal = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
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


      const productImg = await createProductImage(productImgFile, product._id, false, session);
      (product.images as unknown as Array<ProductImageDocument>)?.push(productImg);

      await product.save({ session });

      // * STORING LOCALLY
      await uploadProductImageFileInLocal(productImgFile);

      return next(new CustomSuccess(product, 200));

    });
  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  } finally {
    await session.endSession();
  }
};

export const addNewImageOfProductInS3 = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
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


      const productImg = await createProductImage(productImgFile, product._id, true, session);
      (product.images as unknown as Array<ProductImageDocument>)?.push(productImg);

      await product.save({ session });

      // * STORING IN S3
      await uploadProductImageFileInS3(productImgFile);

      return next(new CustomSuccess(product, 200));

    });
  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  } finally {
    await session.endSession();
  }
};

export const deleteImageOfProductFromLocal = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { productId, imageId } = req.params;

      const [ product, image ] = await Promise.all([
        ProductModel
          .findById(productId)
          .populate('images'),
        ProductImageModel
          .findById(imageId)
      ]);

      const imagePath = <string>image?.url;

      if (!product) {
        throw new Error(`Product with id ${productId} not found`);
      }

      if (!image) {
        throw new Error(`Image with id ${imageId} not found`);
      }

      const indexOfImage = product.images.findIndex(item => {
        return item._id.equals(image._id);
      });

      if (indexOfImage < 0) {
        throw new Error(`Image with id ${imageId} does not belong to product with id ${productId}`);
      }

      if (product.images.length === MIN_IMAGES_PER_PRODUCT) {
        throw new Error(`Minimum image limit reached`);
      }

      product.images?.splice(indexOfImage, 1);

      await Promise.all(<Array<Promise<any>>>[
        image.deleteOne({ session }),
        product.save({ session })
      ]);

      // * DELETING FROM LOCAL
      await deleteProductImageFileFromLocal(imagePath);

      return next(new CustomSuccess(product, 200));
    });
  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  } finally {
    await session.endSession();
  }
};

export const deleteImageOfProductFromS3 = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { productId, imageId } = req.params;

      const [ product, image ] = await Promise.all([
        ProductModel
          .findById(productId)
          .populate('images'),
        ProductImageModel
          .findById(imageId)
      ]);

      const imagePath = <string>image?.url;

      if (!product) {
        throw new Error(`Product with id ${productId} not found`);
      }

      if (!image) {
        throw new Error(`Image with id ${imageId} not found`);
      }

      const indexOfImage = product.images.findIndex(item => {
        return item._id.equals(image._id);
      });

      if (indexOfImage < 0) {
        throw new Error(`Image with id ${imageId} does not belong to product with id ${productId}`);
      }

      if (product.images.length === MIN_IMAGES_PER_PRODUCT) {
        throw new Error(`Minimum image limit reached`);
      }

      product.images?.splice(indexOfImage, 1);

      await Promise.all(<Array<Promise<any>>>[
        image.deleteOne({ session }),
        product.save({ session })
      ]);

      // * DELETING FROM S3
      await deleteProductImageFileFromS3(imagePath);

      return next(new CustomSuccess(product, 200));
    });
  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  } finally {
    await session.endSession();
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
      <Array<any>>product.images?.map(img => img._id.toString())
    )) {
      throw new Error(`Images are different`);
    }

    
    product.images = rearrangedImages
      .map(imgId => <Types.ObjectId>product.images.find(img => img._id.equals(new Types.ObjectId(imgId))));

    await product.save();
    return next(new CustomSuccess(product, 200));

  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  }
};

export const editBasicDetailsOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const { productId } = req.params;

    let product: ProductDocument | null = await ProductModel
      .findById(productId)
      .populate('images');

    if (!product) {
      throw new Error(`Product with id ${productId} not found.`);
    }

    const newBasicDetails = merge<EditProductBasicDetailsDto, any>(
      new EditProductBasicDetailsDto(product),
      req.body
    );

    product.name = newBasicDetails.name;
    product.description = newBasicDetails.description;
    product.quantityInStock = newBasicDetails.quantityInStock;
    product.category = newBasicDetails.category;
    product.isPinned = newBasicDetails.isPinned;
    product.customizationTextRange.min = newBasicDetails.customizationTextRange?.min;
    product.customizationTextRange.max = newBasicDetails.customizationTextRange?.max;
    product.maxRetailPrice = newBasicDetails.maxRetailPrice;
    product.sellingPrice = newBasicDetails.sellingPrice;

    await product.save();
    return next(new CustomSuccess(product, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const editSimilarProductsOfProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
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

      const removeSimilarProductIds: Array<Promise<void>> = product.similarProducts
        .filter(oldProductId => {
          return !newSimilarProductList.some(newProductId => newProductId.equals(oldProductId));
        })
        .map(async (productId) => {
          const oldSimilarProduct = await ProductModel.findById(productId);
          if (oldSimilarProduct) {
            product.similarProducts = product.similarProducts.filter(id => !id.equals(productId));
            oldSimilarProduct.similarProducts = oldSimilarProduct.similarProducts.filter(id => !id.equals(product._id));
            await oldSimilarProduct?.save({ session });
          }
        });

      await Promise.all(
        removeSimilarProductIds
      );

      const addSimilarProductIds: Array<Promise<void>> = newSimilarProductList
        .filter(newProductId => {
          return !product.similarProducts.some(oldProductId => oldProductId.equals(newProductId));
        })
        .map(async (productId) => {
          if (product._id.equals(productId)) {
            throw new Error(`Cannot add product itself as a similar product`);
          }
          const newSimilarProduct = await ProductModel.findById(productId);
          if (!newSimilarProduct) {
            throw new Error(`Product with id ${productId} from similar product array not found`);
          }
          product.similarProducts.push(productId);
          newSimilarProduct.similarProducts.push(product._id);
          await newSimilarProduct.save({ session });
        });

      await Promise.all(
        addSimilarProductIds
      );

      await product.save({ session });
      return next(new CustomSuccess(product, 200));
    });
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  } finally {
    await session.endSession();
  }
};

export const deleteProduct = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      let { productId }: any = req.params;
      productId = new Types.ObjectId(productId);

      const product = await ProductModel
        .findById(productId);

      if (!product) {
        throw new Error(`Product with id ${productId} not found.`);
      }

      const removeProductFromSimilarProduct: Array<Promise<void>> = product.similarProducts.map(async (similarProductId) =>  {
        const similarProduct = await ProductModel.findById(similarProductId);
        if (similarProduct) {
          similarProduct.similarProducts = similarProduct.similarProducts.filter(prodId => {
            prodId = new Types.ObjectId(prodId);
            return !prodId.equals(productId);
          });
          await similarProduct?.save({ session });
        }
      });

      const removeImages: Array<Promise<void>> = product.images.map(async (imageId) => {
        const image = await ProductImageModel.findById(imageId);
        if (image) {
          // * DELETING FROM LOCAL
          await deleteProductImageFileFromLocal(image.url);
          await image.deleteOne({ session });
        }
      });

      await Promise.all([
        ...removeProductFromSimilarProduct,
        ...removeImages
      ]);

      await product.deleteOne({ session });

      return next(new CustomSuccess(product, 200));
    });
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  } finally {
    await session.endSession();
  }
};

export const deleteProductS3 = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      let { productId }: any = req.params;
      productId = new Types.ObjectId(productId);

      const product = await ProductModel
        .findById(productId);

      if (!product) {
        throw new Error(`Product with id ${productId} not found.`);
      }

      const removeProductFromSimilarProduct: Array<Promise<void>> = product.similarProducts.map(async (similarProductId) =>  {
        const similarProduct = await ProductModel.findById(similarProductId);
        if (similarProduct) {
          similarProduct.similarProducts = similarProduct.similarProducts.filter(prodId => {
            prodId = new Types.ObjectId(prodId);
            return !prodId.equals(productId);
          });
          await similarProduct?.save({ session });
        }
      });

      const removeImages: Array<Promise<void>> = product.images.map(async (imageId) => {
        const image = await ProductImageModel.findById(imageId);
        if (image) {
          // * DELETEING FROM S3
          await deleteProductImageFileFromS3(image.url);
          await image.deleteOne();
        }
      });

      await Promise.all([
        ...removeProductFromSimilarProduct,
        ...removeImages
      ]);

      await product.deleteOne();

      return next(new CustomSuccess(product, 200));
    });
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  } finally {
    await session.endSession();
  }
};
