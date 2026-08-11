import { SetMetadata } from '@nestjs/common';

export const SUPPLIER_MEMBER_KEY = 'supplierMember';

/** Supplier owner, SUPPLIER role, or any company team member. */
export const SupplierMember = () => SetMetadata(SUPPLIER_MEMBER_KEY, true);
