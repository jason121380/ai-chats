-- A cost filled in after the call, from today's published rate, is not the
-- same fact as a cost measured against the rate in force at the time. Giving
-- it its own status keeps the two distinguishable forever; folding it into
-- CALCULATED would make an estimate read as accounting.
ALTER TYPE "PricingStatus" ADD VALUE IF NOT EXISTS 'ESTIMATED';
