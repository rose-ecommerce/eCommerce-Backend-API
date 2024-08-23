import mongoose, {
  CallbackWithoutResultAndOptionalError
} from 'mongoose';

import {
  ProductImageInterface,
  ProductImageStorageLocation
} from '../shared';

const productImageSchema = new mongoose.Schema<ProductImageInterface>({
  url: {
    type: String,
    required: true
  },
  storageLocation: {
    type: String,
    enum: Object.values(ProductImageStorageLocation).filter(value => typeof value === 'string'),
    default: ProductImageStorageLocation.LOCAL
  },
  whenCreated: {
    type: Number,
    default: Date.now
  },
  whenLastUpdated: {
    type: Number,
    default: Date.now
  }
});

productImageSchema.pre('updateOne', { document: true, query: false }, function (next: CallbackWithoutResultAndOptionalError) {
  this.whenLastUpdated = Date.now();
  next();
});

export const ProductImageModel = mongoose.model<ProductImageInterface>('ProductImage', productImageSchema);
