const failedDeliveries = new WeakSet<object>();

export const markTwoFactorOtpDeliveryFailed = (context: object) => {
  failedDeliveries.add(context);
};

export const consumeTwoFactorOtpDeliveryFailure = (context: object) =>
  failedDeliveries.delete(context);
