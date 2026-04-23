/**
 * Type declarations for packages that ship without bundled TypeScript definitions.
 */

declare module 'react-native-qrcode-svg' {
  import { Component } from 'react';

  export interface QRCodeProps {
    /** The value to encode into the QR code */
    value: string;
    /** Size in pixels (width & height). Default: 100 */
    size?: number;
    /** Quiet zone (padding) around the QR code. Default: 0 */
    quietZone?: number;
    /** Color of the dark modules. Default: '#000000' */
    color?: string;
    /** Color of the light modules / background. Default: '#FFFFFF' */
    backgroundColor?: string;
    /** Enable linear gradient on dark modules */
    enableLinearGradient?: boolean;
    /** Gradient colors tuple [start, end] */
    linearGradient?: [string, string];
    /** Gradient direction [x1, y1, x2, y2] */
    gradientDirection?: [number, number, number, number];
    /** Logo image source (require() or { uri: string }) */
    logo?: object;
    /** Logo size in pixels. Default: 20% of QR size */
    logoSize?: number;
    /** Logo background color. Default: transparent */
    logoBackgroundColor?: string;
    /** Logo border radius. Default: 0 */
    logoMargin?: number;
    /** Logo border radius. Default: 0 */
    logoBorderRadius?: number;
    /** Error correction level. Default: 'M' */
    ecl?: 'L' | 'M' | 'Q' | 'H';
    /** Called with the SVG ref once mounted */
    getRef?: (ref: SVGElement | null) => void;
    /** Callback that receives a base64 PNG data URL */
    onError?: (error: Error) => void;
    /** testID for testing */
    testID?: string;
  }

  export default class QRCode extends Component<QRCodeProps> {}
}
