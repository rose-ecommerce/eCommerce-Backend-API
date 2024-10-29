import dotenv from 'dotenv';

import {
  EnvironmentInterface
} from '../api/v1/shared';

dotenv.config();

const {
  MODE,
  RAZORPAY_ID_TEST,
  RAZORPAY_SECRET_TEST,
  RAZORPAY_ID_LIVE,
  RAZORPAY_SECRET_LIVE,
} = process.env as unknown as EnvironmentInterface;
let razorpayConfigData = {
  key_id: RAZORPAY_ID_TEST,
  key_secret: RAZORPAY_SECRET_TEST,
};

if (MODE == 'production') {
  razorpayConfigData = {
    key_id: RAZORPAY_ID_LIVE,
    key_secret: RAZORPAY_SECRET_LIVE,
  }
}

export const razorpayConfig = razorpayConfigData;
