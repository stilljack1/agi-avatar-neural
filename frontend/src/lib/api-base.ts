import systemContract from '../../system-contract.json';

export const AGI1_SYSTEM_CONTRACT = systemContract;
export const AGI1_API_BASE = systemContract.domains.api.replace(/\/$/, '');
export const AGI1_API_WS_BASE = systemContract.domains.apiWs.replace(/\/$/, '');
export const AGI1_PRODUCT_URL = systemContract.domains.product.replace(/\/$/, '');
export const AGI1_CORPORATE_URL = systemContract.domains.corporate.replace(/\/$/, '');

export function getAgiApiBase(): string {
  return (process.env.AGI1_API_BASE || process.env.NEXT_PUBLIC_API_URL || AGI1_API_BASE)
    .replace(/\/$/, '');
}

export function getAgiApiWsBase(): string {
  return (process.env.AGI1_WS_BASE || process.env.NEXT_PUBLIC_WS_URL || AGI1_API_WS_BASE)
    .replace(/\/$/, '');
}
