import bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';

import {
  AccessTokenPayloadInterface,
  EnvironmentInterface,
  JWT_EXPIRATION_TIME
} from '..';

/**
 * 
 * @param payload 
 * @returns 
 */
export const getAccessToken = (payload: AccessTokenPayloadInterface) => {
  const { ACCESS_TOKEN_SECRET } = process.env as unknown as EnvironmentInterface;
  const accessToken: string = jwt.sign(
    payload,
    ACCESS_TOKEN_SECRET,
    {
      expiresIn: JWT_EXPIRATION_TIME
    }
  );
  return accessToken;
}

/**
 * 
 * @param password
 * @returns 
 */
export const getHashedPassword = async (password: string): Promise<string> => {
  const salt: string = await bcrypt.genSalt();
  const hashedPassword: string = await bcrypt.hash(password, salt);
  return hashedPassword;
};

/**
 * 
 * @param givenPassword 
 * @param hashedPassword 
 * @returns 
 */
export const isPasswordValid = async (givenPassword: string, hashedPassword: string): Promise<boolean> => {
  const result = await bcrypt.compare(givenPassword, hashedPassword);
  return result;
}
