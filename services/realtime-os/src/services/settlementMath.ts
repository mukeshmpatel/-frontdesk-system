import { Prisma } from "@prisma/client";

export function calculateSettlement(
  grossInput: Prisma.Decimal.Value,
  royaltyInput: Prisma.Decimal.Value,
  marketingInput: Prisma.Decimal.Value,
) {
  const gross = new Prisma.Decimal(grossInput).toDecimalPlaces(2);
  const royaltyRate = new Prisma.Decimal(royaltyInput);
  const marketingRate = new Prisma.Decimal(marketingInput);
  if (gross.isNegative() || royaltyRate.isNegative() || marketingRate.isNegative()
    || royaltyRate.add(marketingRate).greaterThan(1)) {
    throw new Error("Settlement amount or fee percentages are invalid.");
  }
  const corporateCut = gross.mul(royaltyRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const marketingCut = gross.mul(marketingRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    gross,
    royaltyRate,
    marketingRate,
    corporateCut,
    marketingCut,
    franchiseeNet: gross.sub(corporateCut).sub(marketingCut).toDecimalPlaces(2),
  };
}
