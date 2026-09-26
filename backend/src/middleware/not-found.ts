import type { RequestHandler } from "express";
import { AppError } from "../types/errors.js";

export const notFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, "ROUTE_NOT_FOUND", "Route not found"));
};
