import {
  NextFunction,
  Response
} from 'express';
import mongoose, {
  ClientSession,
  FilterQuery,
  Types
} from 'mongoose';
import Razorpay from 'razorpay';

import {
  ACCEPTED_CURRENCY,
  CreateOrderDto,
  CustomError,
  CustomSuccess,
  DEFAULT_SORT_COLUMN,
  DEFAULT_SORT_DIRECTION,
  EditOrderBasicDetailsDto,
  EnvironmentInterface,
  GetUserAuthInfoRequestInterface,
  INR_SUBUNIT,
  NO_SHIPPING_CHARGE_THRESHOLD,
  ORDER_SORTABLE_COLUMNS,
  OrderDocument,
  OrderFilterCriteriaDto,
  OrderStatus,
  PRODUCT_CUSTOMIZATION_TEXT_FORMAT,
  Pagination,
  SHIPPING_CHARGE,
  SortDirection,
  UserDocument,
  UserRole,
  generateHmacSha256,
  isSortStringValid,
  merge,
  retrieveSortInfo
} from '../shared';
import {
  razorpayConfig
} from '../../../config';
import {
  OrderModel,
  ProductModel
} from '../data-models';

export const createOrder = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  const session: ClientSession = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const orderData = new CreateOrderDto(req.body);

      let purchaseAmount: number = 0;

      await Promise.all(
        orderData.purchases.map(async (purchase) => {
          let {
            productId,
            productOrderQty,
            productCustomizationText
          } = purchase;
          productId = new Types.ObjectId(productId);

          const product = await ProductModel.findById(productId);

          if (!product) {
            throw new Error(`Product with id ${productId} not found.`);
          }

          if (productOrderQty > product.quantityInStock) {
            throw new Error(`Insufficient quantity of product with id ${productId} in stock.`);
          }

          if (productCustomizationText.length < product.customizationTextRange.min ||
              productCustomizationText.length > product.customizationTextRange.max) {
            throw new Error(`Customization text of product with id ${productId} is invalid`);
          }

          if (!!product.customizationTextRange.min &&
              !!product.customizationTextRange.max &&
              !PRODUCT_CUSTOMIZATION_TEXT_FORMAT.test(productCustomizationText)) {
            throw new Error(`Customization text of product with id ${productId} is invalid`);
          }

          product.totalPurchases += productOrderQty;

          purchaseAmount += (productOrderQty * product.sellingPrice);

          await product.save({ session });
        })
      );

      const isShippingChargeApplicable: boolean =  !orderData.isSelfPickup && (purchaseAmount < NO_SHIPPING_CHARGE_THRESHOLD);
      const shippingCharge: number = isShippingChargeApplicable ? SHIPPING_CHARGE : 0;

      const razorpay = new Razorpay(razorpayConfig);
      const razorpayAmount = (purchaseAmount + shippingCharge) * INR_SUBUNIT;
      const razorpayOrder = await razorpay.orders.create({
        amount: razorpayAmount,
        currency: ACCEPTED_CURRENCY,
        payment_capture: false
      });

      const order = new OrderModel({
        user: req.loggedInUser?._id,
        razorpayOrderId: razorpayOrder.id,
        purchases: orderData.purchases,
        isSelfPickup: orderData.isSelfPickup,
        purchaseAmount,
        shippingCharge
      });

      await order.save({ session });

      return next(new CustomSuccess(order, 200));
    });
  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  } finally {
    await session.endSession();
  }
};

export const getAllOrders = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const {
      page,
      size,
      sort,
      status
    } = new OrderFilterCriteriaDto(req.query);

    const filterQuery: FilterQuery<OrderDocument> = {};
    const $andFilterQueryList: Array<FilterQuery<OrderDocument>> = [];
    let sortColumn: string = DEFAULT_SORT_COLUMN;
    let sortDirection: SortDirection = DEFAULT_SORT_DIRECTION;

    if (status) {
      $andFilterQueryList.push({ status });
    }

    if (typeof sort === 'string' && sort.length > 0) {
      if (isSortStringValid(sort, ORDER_SORTABLE_COLUMNS)) {
        ({ sortColumn, sortDirection } = retrieveSortInfo(sort));
      } else {
        throw new Error(`Sort string is of invalid format.`);
      }
    }

    if ($andFilterQueryList.length > 0) {
      filterQuery['$and'] = $andFilterQueryList;
    }

    const [ totalElements, orders ] = await Promise.all([
      OrderModel.countDocuments(filterQuery),
      OrderModel
        .find(filterQuery)
        .skip(page * size)
        .limit(size)
        .sort({
          [sortColumn]: sortDirection
        })
        .populate('user')
    ]);

    let totalPages = Math.floor(totalElements / size);
    if ((totalElements % size) > 0) {
      totalPages += 1;
    }

    const pagination = new Pagination(
      orders,
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

export const getOrdersSpecificToUser = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    let { userId }: any = req.params;
    userId = new Types.ObjectId(userId);

    const isLoggedInUserAdminOrMod: boolean =  [
      UserRole.ADMIN,
      UserRole.MODERATOR
    ].includes((<UserDocument>req.loggedInUser)?.role);

    const isLoggedInUserSelf: boolean = (<UserDocument>req.loggedInUser)?._id.equals(userId);

    if (isLoggedInUserAdminOrMod || isLoggedInUserSelf) {
      const {
        page,
        size,
        sort,
        status
      } = new OrderFilterCriteriaDto(req.query);
  
      const filterQuery: FilterQuery<OrderDocument> = {};
      const $andFilterQueryList: Array<FilterQuery<OrderDocument>> = [];
      let sortColumn: string = DEFAULT_SORT_COLUMN;
      let sortDirection: SortDirection = DEFAULT_SORT_DIRECTION;

      $andFilterQueryList.push({ user: userId });
  
      if (status) {
        $andFilterQueryList.push({ status });
      } else {
        $andFilterQueryList.push({ status: { $ne: OrderStatus.PENDING } })
      }
  
      if (typeof sort === 'string' && sort.length > 0) {
        if (isSortStringValid(sort, ORDER_SORTABLE_COLUMNS)) {
          ({ sortColumn, sortDirection } = retrieveSortInfo(sort));
        } else {
          throw new Error(`Sort string is of invalid format.`);
        }
      }
  
  
      if ($andFilterQueryList.length > 0) {
        filterQuery['$and'] = $andFilterQueryList;
      }

      const [ totalElements, orders ] = await Promise.all([
        OrderModel.countDocuments(filterQuery),
        OrderModel
          .find(filterQuery)
          .skip(page * size)
          .limit(size)
          .sort({
            [sortColumn]: sortDirection
          })
          .populate('user')
      ]);

      let totalPages = Math.floor(totalElements / size);
      if ((totalElements % size) > 0) {
        totalPages += 1;
      }

      const pagination = new Pagination(
        orders,
        totalElements,
        totalPages,
        page,
        size,
        sortColumn,
        sortDirection
      );

      return next(new CustomSuccess(pagination, 200));
    } else {
      return next(new CustomError(`Unauthorized access`, 401))
    }
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const getOrder = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    let { orderId }: any = req.params;
    orderId = new Types.ObjectId(orderId);

    const order = await OrderModel
      .findById(orderId)
      .populate('user');

    if (!order) {
      throw new Error(`Order with id ${orderId} not found`);
    }

    const userId = order.user._id;

    const isLoggedInUserAdminOrMod: boolean =  [
      UserRole.ADMIN,
      UserRole.MODERATOR
    ].includes((<UserDocument>req.loggedInUser)?.role);

    const doesOrderBelongsToLoggedInUser: boolean = (<UserDocument>req.loggedInUser)?._id.equals(userId);

    if (isLoggedInUserAdminOrMod || doesOrderBelongsToLoggedInUser) {
      return next(new CustomSuccess(order, 200));
    } else {
      return next(new CustomError(`Unauthorized access`, 401));
    }
  } catch (error: any) {
    return next(new CustomError(error.message, 500));
  }
};

export const editBasicDetailsOfOrder = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    let { orderId }: any = req.params;
    orderId = new Types.ObjectId(orderId);

    let order = await OrderModel
      .findById(orderId)
      .populate('user');
    
    if (!order) {
      throw new Error(`User with id ${orderId} not found.`);
    }

    const newBasicDetails = merge<EditOrderBasicDetailsDto, any>(
      new EditOrderBasicDetailsDto(order),
      req.body
    );

    order.status = newBasicDetails.status;
    order.trackingResource.trackingId = newBasicDetails.trackingResource?.trackingId;
    order.trackingResource.trackingUrl = newBasicDetails.trackingResource?.trackingUrl;
    await order.save();
    return next(new CustomSuccess(order, 200));
  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  }
};

export const verifyOrderPayment = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction) => {
  try {
    const {
      MODE,
      FRONTEND_URL,
      RAZORPAY_SECRET_TEST,
      RAZORPAY_SECRET_LIVE
    } = process.env as unknown as EnvironmentInterface;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    let expectedSignature: string;

    if (MODE === 'production') {
      expectedSignature = generateHmacSha256(body, RAZORPAY_SECRET_LIVE);
    } else {
      expectedSignature = generateHmacSha256(body, RAZORPAY_SECRET_TEST);
    }

    const isAuthentic = expectedSignature === razorpay_signature;

    if (isAuthentic) {

      const razorpay = new Razorpay(razorpayConfig);
      const razorpayOrder = await razorpay.orders.fetch(razorpay_order_id);

      const [ order ] = await Promise.all([
        <Promise<OrderDocument>>OrderModel.findOne({
          razorpayOrderId: razorpay_order_id
        }),

        // * Capturing payment manually
        razorpay.payments.capture(
          razorpay_payment_id,
          razorpayOrder.amount,
          razorpayOrder.currency
        ),
      ]);

      order.status = OrderStatus.PLACED;
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;
      await order.save();

      return res.redirect(

        // * Redirecting to frontend success page
        `${FRONTEND_URL}/orders/${order?._id}`

      );
    } else {
      throw new Error(`Payment failed`);
    }
  } catch (error: any) {
    return next(new CustomError(error.message, 400));
  }
};
