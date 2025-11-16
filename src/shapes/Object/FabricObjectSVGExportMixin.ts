import type { TSVGReviver } from '../../typedefs';
import { uid } from '../../util/internals/uid';
import { colorPropToSVG } from '../../util/misc/svgParsing';
import { FILL, NONE, STROKE } from '../../constants';
import type { FabricObject } from './FabricObject';
import { isFiller } from '../../util/typeAssertions';
import { Pattern } from '../../Pattern';
import { matrixToSVG } from '../../util/misc/svgExport';

export class FabricObjectSVGExportMixin {
  /**
   * When an object is being exported as SVG as a clippath, a reference inside the SVG is needed.
   * This reference is a UID in the fabric namespace and is temporary stored here.
   * @type {String}
   */
  declare clipPathId?: string;

  /**
   * James added, 增加clipPathPattern属性，用于导出svg时 Pattern转Image对象
   */
  declare clipPathPattern?: FabricObject | null;

  /**
   * Returns styles-string for svg-export
   * @param {Boolean} skipShadow a boolean to skip shadow filter output
   * @return {String}
   */
  getSvgStyles(
    this: FabricObjectSVGExportMixin & FabricObject,
    skipShadow?: boolean,
  ) {
    const fillRule = this.fillRule ? this.fillRule : 'nonzero',
      strokeWidth = this.strokeWidth ? this.strokeWidth : '0',
      strokeDashArray = this.strokeDashArray
        ? this.strokeDashArray.join(' ')
        : NONE,
      strokeDashOffset = this.strokeDashOffset ? this.strokeDashOffset : '0',
      strokeLineCap = this.strokeLineCap ? this.strokeLineCap : 'butt',
      strokeLineJoin = this.strokeLineJoin ? this.strokeLineJoin : 'miter',
      strokeMiterLimit = this.strokeMiterLimit ? this.strokeMiterLimit : '4',
      opacity = typeof this.opacity !== 'undefined' ? this.opacity : '1',
      visibility = this.visible ? '' : ' visibility: hidden;',
      filter = skipShadow ? '' : this.getSvgFilter(),
      // James modified, 非skipShadow 时候，fill和stroke都设置为白色
      fill = skipShadow ? colorPropToSVG(FILL, this.fill) : 'fill: white;',
      stroke = skipShadow
        ? colorPropToSVG(STROKE, this.stroke)
        : 'stroke:white;';

    return [
      stroke,
      'stroke-width: ',
      strokeWidth,
      '; ',
      'stroke-dasharray: ',
      strokeDashArray,
      '; ',
      'stroke-linecap: ',
      strokeLineCap,
      '; ',
      'stroke-dashoffset: ',
      strokeDashOffset,
      '; ',
      'stroke-linejoin: ',
      strokeLineJoin,
      '; ',
      'stroke-miterlimit: ',
      strokeMiterLimit,
      '; ',
      fill,
      'fill-rule: ',
      fillRule,
      '; ',
      'opacity: ',
      opacity,
      ';',
      filter,
      visibility,
    ].join('');
  }

  /**
   * Returns filter for svg shadow
   * @return {String}
   */
  getSvgFilter(this: FabricObjectSVGExportMixin & FabricObject) {
    return this.shadow ? `filter: url(#SVGID_${this.shadow.id});` : '';
  }

  /**
   * Returns id attribute for svg output
   * @return {String}
   */
  getSvgCommons(
    this: FabricObjectSVGExportMixin & FabricObject & { id?: string },
  ) {
    return [
      this.id ? `id="${this.id}" ` : '',
      this.clipPath
        ? `clip-path="url(#${
            (this.clipPath as FabricObjectSVGExportMixin & FabricObject)
              .clipPathId
          })" `
        : '',
    ].join('');
  }

  /**
   * Returns transform-string for svg-export
   * @param {Boolean} use the full transform or the single object one.
   * @return {String}
   */
  getSvgTransform(
    this: FabricObjectSVGExportMixin & FabricObject,
    full?: boolean,
    additionalTransform = '',
  ) {
    const transform = full ? this.calcTransformMatrix() : this.calcOwnMatrix(),
      svgTransform = `transform="${matrixToSVG(transform)}`;
    return `${svgTransform}${additionalTransform}" `;
  }

  /**
   * Returns svg representation of an instance
   * This function is implemented in each subclass
   * This is just because typescript otherwise cryies all the time
   * @return {Array} an array of strings with the specific svg representation
   * of the instance
   */
  _toSVG(_reviver?: TSVGReviver): string[] {
    return [''];
  }

  /**
   * Returns svg representation of an instance
   * @param {TSVGReviver} [reviver] Method for further parsing of svg representation.
   * @return {String} svg representation of an instance
   */
  toSVG(
    this: FabricObjectSVGExportMixin & FabricObject,
    reviver?: TSVGReviver,
  ) {
    return this._createBaseSVGMarkup(this._toSVG(reviver), {
      reviver,
    });
  }

  /**
   * Returns svg clipPath representation of an instance
   * @param {TSVGReviver} [reviver] Method for further parsing of svg representation.
   * @return {String} svg representation of an instance
   */
  toClipPathSVG(
    this: FabricObjectSVGExportMixin & FabricObject,
    reviver?: TSVGReviver,
  ) {
    return (
      '\t' +
      this._createBaseClipPathSVGMarkup(this._toSVG(reviver), {
        reviver,
      })
    );
  }

  /**
   * James added
   * Returns pattern svg attributes string
   * @return {String}
   */
  getPatternSvgCommons(
    this: FabricObjectSVGExportMixin & FabricObject & { id?: string },
  ) {
    return [
      this.id ? 'id="' + this.id + '_clip" ' : '',
      this.clipPathPattern
        ? 'clip-path="url(#' + this.clipPathPattern.clipPathId + ')" '
        : '',
    ].join('');
  }

  /**
   * James added
   * Returns id attribute for svg clippath output
   * @return {String}
   */
  getSvgCommonsClipPath(
    this: FabricObjectSVGExportMixin & FabricObject & { id?: string },
  ) {
    if (this.clipPathPattern) {
      return [this.id ? 'id="' + this.id + '" ' : ''].join('');
    } else {
      return this.getSvgCommons();
    }
  }

  /**
   * James added
   * 自定义clipPath的svg输出transform
   * @param {*} full
   * @param {*} additionalTransform
   */
  getSvgTransformClipPath(
    this: FabricObjectSVGExportMixin & FabricObject,
    full: boolean,
    additionalTransform = '',
  ) {
    // 如果是pattern，就不需要transform
    if (this.clipPathPattern) {
      return additionalTransform
        ? 'transform="' + additionalTransform + '" '
        : '';
    } else {
      return this.getSvgTransform(full, additionalTransform);
    }
  }

  /**
   * @private
   */
  _createBaseClipPathSVGMarkup(
    this: FabricObjectSVGExportMixin & FabricObject,
    objectMarkup: string[],
    {
      reviver,
      additionalTransform = '',
    }: { reviver?: TSVGReviver; additionalTransform?: string } = {},
  ) {
    const commonPieces = [
        this.getSvgTransformClipPath(true, additionalTransform),
        this.getSvgCommonsClipPath(),
      ].join(''),
      // insert commons in the markup, style and svgCommons
      index = objectMarkup.indexOf('COMMON_PARTS');
    objectMarkup[index] = commonPieces;
    return reviver ? reviver(objectMarkup.join('')) : objectMarkup.join('');
  }

  /**
   * @private
   */
  _createBaseSVGMarkup(
    this: FabricObjectSVGExportMixin & FabricObject,
    objectMarkup: string[],
    {
      noStyle,
      reviver,
      withShadow,
      additionalTransform,
    }: {
      noStyle?: boolean;
      reviver?: TSVGReviver;
      withShadow?: boolean;
      additionalTransform?: string;
    } = {},
  ): string {
    var skipShadow = true;
    let clipPath = this.clipPath as FabricObjectSVGExportMixin & FabricObject;
    const styleInfo = noStyle
        ? ''
        : `style="${this.getSvgStyles(skipShadow)}" `,
      shadowInfo = withShadow ? `style="${this.getSvgFilter()}" ` : '',
      vectorEffect = this.strokeUniform
        ? 'vector-effect="non-scaling-stroke" '
        : '',
      absoluteClipPath = clipPath && clipPath.absolutePositioned,
      stroke = this.stroke,
      fill = this.fill,
      shadow = this.shadow,
      markup = [],
      // insert commons in the markup, style and svgCommons
      index = objectMarkup.indexOf('COMMON_PARTS');
    // James added
    let commonPieces = '',
      clipPathMarkup = '';

    // 如果是pattern，就生成clipppath
    // 使用 clipPathPattern区别是否是pattern
    this.clipPathPattern = null;
    if (fill instanceof Pattern) {
      this.clipPathPattern = clipPath = this;
    }
    // James added end
    if (clipPath) {
      clipPath.clipPathId = `CLIPPATH_${uid()}`;
      clipPathMarkup = `<clipPath id="${
        clipPath.clipPathId
      }" >\n${clipPath.toClipPathSVG(reviver)}</clipPath>\n`;
    }
    if (absoluteClipPath) {
      markup.push('<g ', shadowInfo, this.getSvgCommons(), ' >\n');
    }
    markup.push(
      '<g ',
      this.getSvgTransform(false),
      !absoluteClipPath ? shadowInfo + this.getSvgCommons() : '',
      ' >\n',
    );
    commonPieces = [
      styleInfo,
      vectorEffect,
      noStyle ? '' : this.addPaintOrder(),
      ' ',
      additionalTransform ? `transform="${additionalTransform}" ` : '',
    ].join('');

    // James added shadow 放在上面
    if (shadow) {
      const styleInfoWithShadow = 'style="' + this.getSvgStyles(false) + '" ';
      const commonPiecesWithShadow = [
        styleInfoWithShadow,
        vectorEffect,
        noStyle ? '' : this.addPaintOrder(),
        ' ',
        additionalTransform ? 'transform="' + additionalTransform + '" ' : '',
      ].join('');
      const objectMarkupCopy = JSON.parse(JSON.stringify(objectMarkup));
      objectMarkupCopy[index] = commonPiecesWithShadow;

      markup.push(objectMarkupCopy.join(''));
      markup.push(shadow.toSVG(this));
    }
    // objectMarkup中是导出主对象(如path)的svg，index下标是style，放在commonPieces
    objectMarkup[index] = commonPieces;
    if (isFiller(fill)) {
      // James added clipPattern apply pattern clip path just for fill.
      if (this.clipPathPattern) {
        markup.push('<g ', shadowInfo, this.getPatternSvgCommons(), ' >\n');
      }
      markup.push(fill.toSVG(this));
      // James added clipPattern
      if (this.clipPathPattern) {
        markup.push('</g>\n');
      }
    }
    if (isFiller(stroke)) {
      markup.push(stroke.toSVG(this));
    }
    if (clipPath) {
      markup.push(clipPathMarkup);
    }
    markup.push(objectMarkup.join(''));
    markup.push('</g>\n');
    absoluteClipPath && markup.push('</g>\n');
    return reviver ? reviver(markup.join('')) : markup.join('');
  }

  addPaintOrder(this: FabricObjectSVGExportMixin & FabricObject) {
    return this.paintFirst !== FILL ? ` paint-order="${this.paintFirst}" ` : '';
  }
}
