/**
 * Brand layer — event identity, backgrounds, sponsor presentation and the
 * persistent broadcast furniture.
 */

export {
  BRAND_ASSETS,
  SPONSOR_PREFIX,
  SPONSOR_TICKER_ORDER,
  brandCropStyle,
  resolveBrandAsset,
  type BrandAsset,
  type BrandAssetKey,
} from '@/components/brand/brand-assets';

export {
  BroadcastHeader,
  type BroadcastHeaderProps,
} from '@/components/brand/BroadcastHeader';
export { EventMark, type EventMarkProps, type EventMarkVariant } from '@/components/brand/EventMark';
export {
  EventQr,
  type EventQrLabelPlacement,
  type EventQrProps,
  type EventQrTone,
} from '@/components/brand/EventQr';
export {
  SponsorLogo,
  type SponsorLogoItem,
  type SponsorLogoProps,
} from '@/components/brand/SponsorLogo';
export { SponsorTicker, type SponsorTickerProps } from '@/components/brand/SponsorTicker';
export {
  StarField,
  type StarFieldIntensity,
  type StarFieldProps,
  type StarFieldVariant,
} from '@/components/brand/StarField';
