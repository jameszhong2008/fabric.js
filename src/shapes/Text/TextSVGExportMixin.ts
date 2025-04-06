import { config } from '../../config';
import type { TSVGReviver } from '../../typedefs';
import { escapeXml } from '../../util/lang_string';
import { colorPropToSVG, createSVGRect } from '../../util/misc/svgParsing';
import { hasStyleChanged } from '../../util/misc/textStyles';
import { toFixed } from '../../util/misc/toFixed';
import { FabricObjectSVGExportMixin } from '../Object/FabricObjectSVGExportMixin';
import { type TextStyleDeclaration } from './StyledText';
import { JUSTIFY } from '../Text/constants';
import type { FabricText } from './Text';
import { STROKE, FILL } from '../../constants';
import { Path } from '../Path';

const multipleSpacesRegex = /  +/g;
const dblQuoteRegex = /"/g;

function createSVGInlineRect(
  color: string,
  left: number,
  top: number,
  width: number,
  height: number,
) {
  return `\t\t${createSVGRect(color, { left, top, width, height })}\n`;
}

export class TextSVGExportMixin extends FabricObjectSVGExportMixin {
  _toSVG(this: TextSVGExportMixin & FabricText): string[] {
    const offsets = this._getSVGLeftTopOffsets();
    let textAndBg;
    if (this.path) {
      // James added
      textAndBg = this._getTextPath();
    } else {
      textAndBg = this._getSVGTextAndBg(offsets.textTop, offsets.textLeft);
    }
    return this._wrapSVGTextAndBg(textAndBg);
  }

  toSVG(this: TextSVGExportMixin & FabricText, reviver?: TSVGReviver): string {
    return this._createBaseSVGMarkup(this._toSVG(), {
      reviver,
      noStyle: true,
      withShadow: true,
    });
  }

  /**
   * James added
   * @param this
   * @returns
   */
  private _getTextPath(
    this: TextSVGExportMixin & FabricText & { id?: string },
  ) {
    const textSpans: string[] = [];
    const textBgRects: string[] = [];
    const content = this._textLines.map((v) => v.join('')).join('');

    let visibleContent = '';
    // 隐藏状态的文字 __charBounds 为空
    if (this.__charBounds.length) {
      Array.from(content).forEach((c, i) => {
        const charBox = this.__charBounds[0][i];
        if (!charBox || !charBox.visible) return;
        visibleContent += c;
      });
    }

    const align: string[] = [];
    const alignMap: { [key: string]: { anchor: string; offset: string } } = {
      center: { anchor: 'middle', offset: '50%' },
      right: { anchor: 'end', offset: '100%' },
    };
    if (this.textAlign === 'center' || this.textAlign === 'right') {
      align.push(
        `text-anchor="${alignMap[this.textAlign].anchor}" `,
        `startOffset="${alignMap[this.textAlign].offset}" `,
      );
    }

    const pathId = `TEXTPATH_${this.id}`;
    const textPath = [
      `<textPath href="#${pathId}" `,
      align.join(''),
      '>',
      escapeXml(visibleContent),
      '</textPath>',
    ].join('');

    textSpans.push(textPath);
    return {
      textSpans,
      textBgRects,
    };
  }

  private _getSVGLeftTopOffsets(this: TextSVGExportMixin & FabricText) {
    return {
      textLeft: -this.width / 2,
      textTop: -this.height / 2,
      lineTop: this.getHeightOfLine(0),
    };
  }

  private _wrapSVGTextAndBg(
    this: TextSVGExportMixin & FabricText,
    {
      textBgRects,
      textSpans,
    }: {
      textSpans: string[];
      textBgRects: string[];
    },
  ) {
    const noShadow = true,
      textDecoration = this.getSvgTextDecoration(this);
    return [
      textBgRects.join(''),
      '\t\t<text xml:space="preserve" ',
      this.fontFamily
        ? `font-family="${this.fontFamily.replace(dblQuoteRegex, "'")}" `
        : '',
      this.fontSize ? `font-size="${this.fontSize}" ` : '',
      this.fontStyle ? `font-style="${this.fontStyle}" ` : '',
      this.fontWeight ? `font-weight="${this.fontWeight}" ` : '',
      // James modified
      // 增加 letter-space line-height textalign，用于 Vectr2.0导入
      this.charSpacing
        ? 'letter-spacing="' + this._getWidthOfCharSpacing() + '" '
        : '',
      // svg 暂时不支持该属性，只能用于 Vectr2.0导入
      this.lineHeight ? 'line-height="' + this.lineHeight + '" ' : '',
      textDecoration ? `text-decoration="${textDecoration}" ` : '',
      this.direction === 'rtl' ? `direction="${this.direction}" ` : '',
      'style="',
      this.getSvgStyles(noShadow),
      '"',
      this.addPaintOrder(),
      ' >',
      textSpans.join(''),
      '</text>\n',
    ];
  }

  /**
   * @private
   * @param {Number} textTopOffset Text top offset
   * @param {Number} textLeftOffset Text left offset
   * @return {Object}
   */
  private _getSVGTextAndBg(
    this: TextSVGExportMixin & FabricText,
    textTopOffset: number,
    textLeftOffset: number,
  ) {
    const textSpans: string[] = [],
      textBgRects: string[] = [];
    let height = textTopOffset,
      lineOffset;

    // bounding-box background
    this.backgroundColor &&
      textBgRects.push(
        ...createSVGInlineRect(
          this.backgroundColor,
          -this.width / 2,
          -this.height / 2,
          this.width,
          this.height,
        ),
      );

    // text and text-background
    for (let i = 0, len = this._textLines.length; i < len; i++) {
      // James modified
      let heightOfLine = this.getHeightOfLine(i);
      let realHeightOfLine = heightOfLine / this.lineHeight;

      // 2022.3.1 超过box高度，不显示 text
      if (height + realHeightOfLine * 0.8 > this.height / 2) {
        break;
      }

      lineOffset = this._getLineLeftOffset(i);
      if (this.direction === 'rtl') {
        lineOffset += this.width;
      }
      if (this.textBackgroundColor || this.styleHas('textBackgroundColor', i)) {
        this._setSVGTextLineBg(
          textBgRects,
          i,
          textLeftOffset + lineOffset,
          height,
        );
      }
      this._setSVGTextLineText(
        textSpans,
        i,
        textLeftOffset + lineOffset,
        height,
      );
      height += heightOfLine;
    }

    return {
      textSpans,
      textBgRects,
    };
  }

  private _createTextCharSpan(
    this: TextSVGExportMixin & FabricText,
    char: string,
    styleDecl: TextStyleDeclaration,
    left: number,
    top: number,
  ) {
    const styleProps = this.getSvgSpanStyles(
        styleDecl,
        char !== char.trim() || !!char.match(multipleSpacesRegex),
      ),
      fillStyles = styleProps ? `style="${styleProps}"` : '',
      dy = styleDecl.deltaY,
      dySpan = dy ? ` dy="${toFixed(dy, config.NUM_FRACTION_DIGITS)}" ` : '';

    return `<tspan x="${toFixed(
      left,
      config.NUM_FRACTION_DIGITS,
    )}" y="${toFixed(
      top,
      config.NUM_FRACTION_DIGITS,
    )}" ${dySpan}${fillStyles}>${escapeXml(char)}</tspan>`;
  }
  /**
   * James modified
   */
  private _setSVGTextLineText(
    this: TextSVGExportMixin & FabricText,
    textSpans: string[],
    lineIndex: number,
    textLeftOffset: number,
    textTopOffset: number,
  ) {
    const lineHeight = this.getHeightOfLine(lineIndex),
      isJustify = this.textAlign.includes(JUSTIFY),
      line = this._textLines[lineIndex];
    let actualStyle,
      nextStyle,
      charsToRender = '',
      charBox,
      style,
      boxWidth = 0,
      timeToRender;

    textTopOffset +=
      (lineHeight * (1 - this._fontSizeFraction)) / this.lineHeight;

    // James modified
    // 空行增加空tspan用于 Vectr2.0导入时表示空行
    if (line.length === 0) {
      style = {};
      textSpans.push(
        this._createTextCharSpan('', style, textLeftOffset, textTopOffset),
      );
    }

    for (let i = 0, len = line.length - 1; i <= len; i++) {
      timeToRender = i === len || this.charSpacing;
      charsToRender += line[i];
      charBox = this.__charBounds[lineIndex][i];
      if (boxWidth === 0) {
        textLeftOffset += charBox.kernedWidth - charBox.width;
        boxWidth += charBox.width;
      } else {
        boxWidth += charBox.kernedWidth;
      }
      if (isJustify && !timeToRender) {
        if (this._reSpaceAndTab.test(line[i])) {
          timeToRender = true;
        }
      }
      if (!timeToRender) {
        // if we have charSpacing, we render char by char
        actualStyle =
          actualStyle || this.getCompleteStyleDeclaration(lineIndex, i);
        nextStyle = this.getCompleteStyleDeclaration(lineIndex, i + 1);
        // James modified forTextSpan = false
        timeToRender = hasStyleChanged(actualStyle, nextStyle, false);
      }
      if (timeToRender) {
        style = this._getStyleDeclaration(lineIndex, i);
        textSpans.push(
          this._createTextCharSpan(
            charsToRender,
            style,
            textLeftOffset,
            textTopOffset,
          ),
        );
        charsToRender = '';
        actualStyle = nextStyle;
        if (this.direction === 'rtl') {
          textLeftOffset -= boxWidth;
        } else {
          textLeftOffset += boxWidth;
        }
        boxWidth = 0;
      }
    }
  }

  private _setSVGTextLineBg(
    this: TextSVGExportMixin & FabricText,
    textBgRects: (string | number)[],
    i: number,
    leftOffset: number,
    textTopOffset: number,
  ) {
    const line = this._textLines[i],
      heightOfLine = this.getHeightOfLine(i) / this.lineHeight;
    let boxWidth = 0,
      boxStart = 0,
      currentColor,
      lastColor = this.getValueOfPropertyAt(i, 0, 'textBackgroundColor');
    for (let j = 0; j < line.length; j++) {
      const { left, width, kernedWidth } = this.__charBounds[i][j];
      currentColor = this.getValueOfPropertyAt(i, j, 'textBackgroundColor');
      if (currentColor !== lastColor) {
        lastColor &&
          textBgRects.push(
            ...createSVGInlineRect(
              lastColor,
              leftOffset + boxStart,
              textTopOffset,
              boxWidth,
              heightOfLine,
            ),
          );
        boxStart = left;
        boxWidth = width;
        lastColor = currentColor;
      } else {
        boxWidth += kernedWidth;
      }
    }
    currentColor &&
      textBgRects.push(
        ...createSVGInlineRect(
          lastColor,
          leftOffset + boxStart,
          textTopOffset,
          boxWidth,
          heightOfLine,
        ),
      );
  }

  /**
   * @deprecated unused
   */
  _getSVGLineTopOffset(
    this: TextSVGExportMixin & FabricText,
    lineIndex: number,
  ) {
    let lineTopOffset = 0,
      j;
    for (j = 0; j < lineIndex; j++) {
      lineTopOffset += this.getHeightOfLine(j);
    }
    const lastHeight = this.getHeightOfLine(j);
    return {
      lineTop: lineTopOffset,
      offset:
        ((this._fontSizeMult - this._fontSizeFraction) * lastHeight) /
        (this.lineHeight * this._fontSizeMult),
    };
  }

  /**
   * Returns styles-string for svg-export
   * @param {Boolean} skipShadow a boolean to skip shadow filter output
   * @return {String}
   */
  getSvgStyles(this: TextSVGExportMixin & FabricText, skipShadow?: boolean) {
    return `${super.getSvgStyles(skipShadow)} white-space: pre;`;
  }

  /**
   * Returns styles-string for svg-export
   * @param {Object} style the object from which to retrieve style properties
   * @param {Boolean} useWhiteSpace a boolean to include an additional attribute in the style.
   * @return {String}
   */
  getSvgSpanStyles(
    this: TextSVGExportMixin & FabricText,
    style: TextStyleDeclaration,
    useWhiteSpace?: boolean,
  ) {
    const {
      fontFamily,
      strokeWidth,
      stroke,
      fill,
      fontSize,
      fontStyle,
      fontWeight,
      deltaY,
    } = style;

    const textDecoration = this.getSvgTextDecoration(style);

    return [
      stroke ? colorPropToSVG(STROKE, stroke) : '',
      strokeWidth ? `stroke-width: ${strokeWidth}; ` : '',
      fontFamily
        ? `font-family: ${
            !fontFamily.includes("'") && !fontFamily.includes('"')
              ? `'${fontFamily}'`
              : fontFamily
          }; `
        : '',
      fontSize ? `font-size: ${fontSize}px; ` : '',
      fontStyle ? `font-style: ${fontStyle}; ` : '',
      fontWeight ? `font-weight: ${fontWeight}; ` : '',
      textDecoration ? `text-decoration: ${textDecoration}; ` : textDecoration,
      fill ? colorPropToSVG(FILL, fill) : '',
      deltaY ? `baseline-shift: ${-deltaY}; ` : '',
      useWhiteSpace ? 'white-space: pre; ' : '',
    ].join('');
  }

  /**
   * Returns text-decoration property for svg-export
   * @param {Object} style the object from which to retrieve style properties
   * @return {String}
   */
  getSvgTextDecoration(
    this: TextSVGExportMixin & FabricText,
    style: TextStyleDeclaration,
  ) {
    return (['overline', 'underline', 'line-through'] as const)
      .filter(
        (decoration) =>
          style[
            decoration.replace('-', '') as
              | 'overline'
              | 'underline'
              | 'linethrough'
          ],
      )
      .join(' ');
  }
}
