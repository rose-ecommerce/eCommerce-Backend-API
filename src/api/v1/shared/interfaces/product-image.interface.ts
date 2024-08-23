import {
  ProductImageStorageLocation
} from '../enums';
import {
  BaseModelInterface
} from './';

export interface ProductImageInterface extends BaseModelInterface {
  url: string;
  storageLocation: ProductImageStorageLocation
};
