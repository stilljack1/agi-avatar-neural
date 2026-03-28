// ─────────────────────────────────────────────────────────
//  AGI-1 — Production Configuration
//  All routes point to agi1.org infrastructure (AWS EC2)
// ─────────────────────────────────────────────────────────

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const productUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_PRODUCT_URL || 'https://agi1.org'
);

const avatarNeuralUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_AVATAR_NEURAL_URL || `${productUrl}/neural`
);

const taskInterfaceUrl = stripTrailingSlash(
  process.env.NEXT_PUBLIC_TASK_INTERFACE_URL || `${productUrl}/dashboard`
);

export const AGI_CONFIG = {
  corporateUrl: stripTrailingSlash(
    process.env.NEXT_PUBLIC_CORPORATE_URL || 'https://fairgroupai.com'
  ),
  productUrl,
  backendUrl: stripTrailingSlash(
    process.env.NEXT_PUBLIC_AGI_BACKEND_URL || 'https://api.agi1.org'
  ),
  avatarNeuralUrl,
  taskInterfaceUrl,
  avatarRoutes: {
    jack: `${productUrl}/jack`,
    julia: `${productUrl}/julia`,
  },
  systemVersion: '2.0.0-PROD',
} as const;
