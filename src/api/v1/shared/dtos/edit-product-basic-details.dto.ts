import {
  Categories,
  ProductInterface,
  MIN_PRODUCT_PRICE,
  MIN_QTY_IN_STOCK
} from '../../shared';

export class EditProductBasicDetailsDto implements Partial<ProductInterface> {
  name: string;
  description: string;
  quantityInStock: number;
  category: Categories;
  isPopular: boolean;
  price: number;

  constructor(reqBody: Record<string, any>) {
    this.name = reqBody?.name || '';
    this.description = reqBody?.description || '';
    this.isPopular = ((typeof reqBody?.isPopular) === 'boolean') ? reqBody?.isPopular : false;
    this.price = parseFloat(reqBody?.price) || MIN_PRODUCT_PRICE;
    this.quantityInStock = parseInt(reqBody?.quantityInStock) || MIN_QTY_IN_STOCK;
    this.category = reqBody?.category || Categories.OTHERS;
  }
}