import multer from 'multer';
import express from 'express';

import {
  addNewImageOfProductInLocal,
  createProduct,
  deleteImageOfProductFromLocal,
  deleteProduct,
  createProductS3,
  addNewImageOfProductInS3,
  deleteImageOfProductFromS3,
  deleteProductS3,
  getProduct,
  getProducts,
  rearrangeImagesOfProduct,
  editSimilarProductsOfProduct,
  getProductsWithIds,
  editBasicDetailsOfProduct,
} from '../controllers';
import {
  isAuthenticateUserAdminOrMod,
  isAuthenticated
} from '../shared';

const router = express.Router();
const upload = multer();

// * UNAUTHORIZED ROUTES
router.get('/', getProducts);
router.get('/:productId', getProduct);
router.post('/with-ids', getProductsWithIds);

// * AUTHORIZED ROUTES - CUSTOMER
router.use(isAuthenticated);

// * AUTHORIZED ROUTES - ADMIN & MODERATORS
router.use(isAuthenticateUserAdminOrMod);

// router.post('/', upload.array('product-images'), createProduct);
router.post('/', upload.array('product-images'), createProductS3);

// router.post('/:productId/images', upload.single('product-image'), addNewImageOfProductInLocal);
router.post('/:productId/images', upload.single('product-image'), addNewImageOfProductInS3);

router.put('/:productId/images', rearrangeImagesOfProduct);
router.put('/:productId/basic-details', editBasicDetailsOfProduct);
router.put('/:productId/similar-products', editSimilarProductsOfProduct);

// router.delete('/:productId', deleteProduct);
router.delete('/:productId', deleteProductS3);

// router.delete('/:productId/images/:imageId', deleteImageOfProductFromLocal);
router.delete('/:productId/images/:imageId', deleteImageOfProductFromS3);

export const productRoutes = router;
