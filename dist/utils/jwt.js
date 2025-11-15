"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.signToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const SECRET = process.env.JWT_SECRET;
const signToken = (p) => jsonwebtoken_1.default.sign(p, SECRET, { expiresIn: "7d" });
exports.signToken = signToken;
const verifyToken = (t) => jsonwebtoken_1.default.verify(t, SECRET);
exports.verifyToken = verifyToken;
