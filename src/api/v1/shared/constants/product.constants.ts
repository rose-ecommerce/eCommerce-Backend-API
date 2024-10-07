import {
  ProductInterface
} from '../interfaces';
import {
  BASE_SORTABLE_COLUMNS
} from './common.constants';

export const ACCEPTED_IMG_EXTENSIONS = ['jpeg', 'jpg', 'png'];

export const PRODUCT_NAME_LENGTH_RANGE = {
  MIN: 3,
  MAX: 200
} as const;

export const PRODUCT_DESCRIPTION_LENGTH_RANGE = {
  MIN: 5,
  MAX: 1000
} as const;

/**
 * Targeted image size in bytes which is 102400 bytes or 300 kilobytes
 */
export const TARGETED_IMG_SIZE = 300 * 1024;

export const MAX_IMAGES_PER_PRODUCT = 3;

export const MIN_IMAGES_PER_PRODUCT = 1;

export const PRODUCT_CATEGORY_NAME_FORMAT = /^(?!_)(?!.*__)(?!.*_$)[a-z_]+$/;

export const PRODUCT_CUSTOMIZATION_TEXT_FORMAT = /^[A-Z0-9]+$/;

export const DEFAULT_PAGINATION_PAGE = 0;

export const DEFAULT_PAGINATION_SIZE = 9;

export const MIN_QTY_IN_STOCK = 0;

export const MIN_PRODUCT_PRICE = 1;

export const PRODUCT_IMG_UPLOAD_PATH = './dist/public';

export const AWS_PRODUCT_IMG_FOLDER_NAME = 'product-images';

export const PRODUCT_SORTABLE_COLUMNS: readonly (keyof ProductInterface)[] = [
  ...BASE_SORTABLE_COLUMNS,
  'sellingPrice',
  'totalPurchases',
];
