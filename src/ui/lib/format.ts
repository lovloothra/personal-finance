export const inr = (n: number): string =>
  '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');

export const inr2 = (n: number): string =>
  '₹' +
  Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
