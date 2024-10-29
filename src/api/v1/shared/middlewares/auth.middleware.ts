import {
  NextFunction,
  Response
} from 'express';
import * as jwt from 'jsonwebtoken';

import { UserModel } from '../../data-models';
import {
  GetUserAuthInfoRequestInterface,
  AccessTokenPayloadInterface,
  EnvironmentInterface
} from '../interfaces';
import {
  CustomError
} from '../utility-classes';
import {
  UserRole
} from '../enums';

/**
 * Checks whether user is logged in
 */
export const isAuthenticated = async (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction): Promise<void> => {
  const accessToken = req?.headers?.authorization?.split(' ')[1];
  const { ACCESS_TOKEN_SECRET } = process.env as unknown as EnvironmentInterface;
  if (accessToken) {
    try {
      const embeddedPayloadFromJwt = <AccessTokenPayloadInterface>jwt.verify(
        accessToken,
        ACCESS_TOKEN_SECRET,
      );
      const loggedInUserId = embeddedPayloadFromJwt?.userId;
      if (loggedInUserId) {
        const user = await UserModel.findById(loggedInUserId);
        if (user) {
          // * Adding custom property to req
          req.loggedInUser = user;
          next();
        } else {
          throw new Error(`Unauthorized access`);
        }
      } else {
        throw new Error(`Unauthorized access`);
      }
    } catch(error: any) {
      next(new CustomError(error.message, 401));
    }
  } else {
    next(new CustomError(`Unauthorized access`, 401));
  }
};

/**
 * Checks whether logged in user is ADMIN or MODERATOR.
 * 
 * Note:- In order for following middleware to work, isAuthenticated middleware needs to be executed first.
 */
export const isAuthenticateUserAdminOrMod = (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction): void => {
  try {
    if (!req?.loggedInUser ||
        (req?.loggedInUser && req.loggedInUser.role === UserRole.CUSTOMER)) {
      throw new Error(`Unauthorised access`);
    }
    next();
  } catch (error: any) {
    next(new CustomError(error.message, 401));
  }
};

/**
 * Checks whether logged in user is strictly ADMIN.
 * 
 * Note:- In order for following middleware to work, isAuthenticated middleware needs to be executed first.
 */
export const isAuthenticateUserStrictlyAdmin = (req: GetUserAuthInfoRequestInterface, res: Response, next: NextFunction): void => {
  try {
    if (!req?.loggedInUser ||
        (req?.loggedInUser &&
        (req.loggedInUser.role === UserRole.CUSTOMER ||
        req.loggedInUser.role === UserRole.MODERATOR))) {
      throw new Error(`Unauthorised access`);
    }
    next();
  } catch (error: any) {
    next(new CustomError(error.message, 401));
  }
};