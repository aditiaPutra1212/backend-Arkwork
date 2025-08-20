declare module 'midtrans-client' {
  export class Snap {
    constructor(options: { isProduction: boolean; serverKey?: string; clientKey?: string });
    createTransaction(parameters: any): Promise<any>;
    createTransactionToken(parameters: any): Promise<string>;
  }

  export class CoreApi {
    constructor(options: { isProduction: boolean; serverKey: string; clientKey?: string });
    charge(parameters: any): Promise<any>;
    capture(parameters: any): Promise<any>;
    cardRegister(parameters: any): Promise<any>;
  }
}
