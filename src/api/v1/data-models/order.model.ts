import mongoose, { Schema } from 'mongoose';

import {
  OrderInterface,
  OrderStatus
} from '../shared';

const orderSchema = new mongoose.Schema<OrderInterface>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  razorpayOrderId: {
    type: String,
    required: true
  },
  purchases: {
    type: Map,
    of: Number,
    required: true,
  },
  status: {
    type: String,
    enum: [
      OrderStatus.PENDING,
      OrderStatus.PLACED,
      OrderStatus.CONFIRMED,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ],
    default: OrderStatus.PENDING
  },
  whenCreated: {
    type: Date,
    default: Date.now
  }
});

export const OrderModel = mongoose.model<OrderInterface>('Order', orderSchema);