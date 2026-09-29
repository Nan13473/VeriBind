declare module "jsqr" {
  type QRCode = { data: string };
  type ImageDataLike = { data: Uint8ClampedArray; width: number; height: number };
  export default function jsQR(data: Uint8ClampedArray, width: number, height: number): QRCode | null;
}
