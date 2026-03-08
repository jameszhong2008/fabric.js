import type { Abortable, TClassProperties, TOptions } from '../typedefs';
import { IText } from './IText/IText';
import { classRegistry } from '../ClassRegistry';
import { createTextboxDefaultControls } from '../controls/commonControls';
import { JUSTIFY } from './Text/constants';
import type { TextStyleDeclaration } from './Text/StyledText';
import type { SerializedITextProps, ITextProps } from './IText/IText';
import type { ITextEvents } from './IText/ITextBehavior';
import type { TextLinesInfo } from './Text/Text';
import type { Control } from '../controls/Control';
import type { CSSRules } from '../parser/typedefs';
import { parseAttributes } from '../parser/parseAttributes';
import { Path } from './Path';
import { DEFAULT_SVG_FONT_SIZE } from '../constants';

// @TODO: Many things here are configuration related and shouldn't be on the class nor prototype
// regexes, list of properties that are not suppose to change by instances, magic consts.
// this will be a separated effort
export const textboxDefaultValues: Partial<TClassProperties<Textbox>> = {
  minWidth: 20,
  dynamicMinWidth: 2,
  lockScalingFlip: true,
  noScaleCache: false,
  _wordJoiners: /[ \t\r]/,
  splitByGrapheme: false,
};

export type GraphemeData = {
  wordsData: {
    word: string[];
    width: number;
  }[][];
  largestWordWidth: number;
};

export type StyleMap = Record<string, { line: number; offset: number }>;

// @TODO this is not complete
interface UniqueTextboxProps {
  minWidth: number;
  splitByGrapheme: boolean;
  dynamicMinWidth: number;
  _wordJoiners: RegExp;
}

export interface SerializedTextboxProps
  extends SerializedITextProps,
    Pick<UniqueTextboxProps, 'minWidth' | 'splitByGrapheme'> {}

export interface TextboxProps extends ITextProps, UniqueTextboxProps {}

/**
 * Textbox class, based on IText, allows the user to resize the text rectangle
 * and wraps lines automatically. Textboxes have their Y scaling locked, the
 * user can only change width. Height is adjusted automatically based on the
 * wrapping of lines.
 */
export class Textbox<
    Props extends TOptions<TextboxProps> = Partial<TextboxProps>,
    SProps extends SerializedTextboxProps = SerializedTextboxProps,
    EventSpec extends ITextEvents = ITextEvents,
  >
  extends IText<Props, SProps, EventSpec>
  implements UniqueTextboxProps
{
  /**
   * Minimum width of textbox, in pixels.
   * @type Number
   * @default
   */
  declare minWidth: number;

  /**
   * Minimum calculated width of a textbox, in pixels.
   * fixed to 2 so that an empty textbox cannot go to 0
   * and is still selectable without text.
   * @type Number
   * @default
   */
  declare dynamicMinWidth: number;

  /**
   * Use this boolean property in order to split strings that have no white space concept.
   * this is a cheap way to help with chinese/japanese
   * @type Boolean
   * @since 2.6.0
   */
  declare splitByGrapheme: boolean;

  declare _wordJoiners: RegExp;

  declare _styleMap: StyleMap;

  declare isWrapping: boolean;

  static type = 'Textbox';

  static textLayoutProperties = [...IText.textLayoutProperties, 'width'];

  static ownDefaults = textboxDefaultValues;

  // James modified 自动计算文字高度
  static enableCalcTextHeight = false;

  /**
   * James modified 自动计算文字高度
   * 增加wrap宽度，设置为page的宽度
   * 增加textbox wrap的默认宽度
   * @type Number
   * @default
   */
  static defaultWrapWidth = 1920;

  static getDefaults(): Record<string, any> {
    return {
      ...super.getDefaults(),
      ...Textbox.ownDefaults,
    };
  }

  /**
   * Constructor
   * @param {String} text Text string
   * @param {Object} [options] Options object
   */
  constructor(text: string, options?: Props) {
    super(text, { ...Textbox.ownDefaults, ...options } as Props);
  }

  /**
   * Creates the default control object.
   * If you prefer to have on instance of controls shared among all objects
   * make this function return an empty object and add controls to the ownDefaults object
   */
  static createControls(): { controls: Record<string, Control> } {
    return { controls: createTextboxDefaultControls() };
  }

  /**
   * Unlike superclass's version of this function, Textbox does not update
   * its width.
   * @private
   * @override
   */
  initDimensions() {
    if (!this.initialized) {
      return;
    }
    this.isEditing && this.initDelayedCursor();
    this._clearCache();
    // clear dynamicMinWidth as it will be different after we re-wrap line
    this.dynamicMinWidth = 0;
    // wrap lines
    this._styleMap = this._generateStyleMap(this._splitText());
    // James modified
    // if after wrapping, the width is smaller than dynamicMinWidth, change the width and re-wrap
    if (!this.path && this.dynamicMinWidth > this.width) {
      this._set('width', this.dynamicMinWidth);
    }
    if (this.textAlign.includes(JUSTIFY)) {
      // once text is measured we need to make space fatter to make justified text.
      this.enlargeSpaces();
    }
    // James modified 取消 textbox 自动计算高度
    if (!this.path && Textbox.enableCalcTextHeight) {
      // clear cache and re-calculate height
      this.height = this.calcTextHeight();
    }
    this.preventGroupCache = this.path ? true : false;
  }

  /**
   * Generate an object that translates the style object so that it is
   * broken up by visual lines (new lines and automatic wrapping).
   * The original text styles object is broken up by actual lines (new lines only),
   * which is only sufficient for Text / IText
   * @private
   */
  _generateStyleMap(textInfo: TextLinesInfo): StyleMap {
    let realLineCount = 0,
      realLineCharCount = 0,
      charCount = 0;
    const map: StyleMap = {};

    for (let i = 0; i < textInfo.graphemeLines.length; i++) {
      if (textInfo.graphemeText[charCount] === '\n' && i > 0) {
        realLineCharCount = 0;
        charCount++;
        realLineCount++;
      } else if (
        !this.splitByGrapheme &&
        this._reSpaceAndTab.test(textInfo.graphemeText[charCount]) &&
        i > 0
      ) {
        // this case deals with space's that are removed from end of lines when wrapping
        realLineCharCount++;
        charCount++;
      }

      map[i] = { line: realLineCount, offset: realLineCharCount };

      charCount += textInfo.graphemeLines[i].length;
      realLineCharCount += textInfo.graphemeLines[i].length;
    }

    return map;
  }

  /**
   * Returns true if object has a style property or has it on a specified line
   * @param {Number} lineIndex
   * @return {Boolean}
   */
  styleHas(property: keyof TextStyleDeclaration, lineIndex: number): boolean {
    if (this._styleMap && !this.isWrapping) {
      const map = this._styleMap[lineIndex];
      if (map) {
        lineIndex = map.line;
      }
    }
    return super.styleHas(property, lineIndex);
  }

  /**
   * Returns true if object has no styling or no styling in a line
   * @param {Number} lineIndex , lineIndex is on wrapped lines.
   * @return {Boolean}
   */
  isEmptyStyles(lineIndex: number): boolean {
    if (!this.styles) {
      return true;
    }
    let offset = 0,
      nextLineIndex = lineIndex + 1,
      nextOffset: number,
      shouldLimit = false;
    const map = this._styleMap[lineIndex],
      mapNextLine = this._styleMap[lineIndex + 1];
    if (map) {
      lineIndex = map.line;
      offset = map.offset;
    }
    if (mapNextLine) {
      nextLineIndex = mapNextLine.line;
      shouldLimit = nextLineIndex === lineIndex;
      nextOffset = mapNextLine.offset;
    }
    const obj =
      typeof lineIndex === 'undefined'
        ? this.styles
        : { line: this.styles[lineIndex] };
    for (const p1 in obj) {
      for (const p2 in obj[p1]) {
        const p2Number = parseInt(p2, 10);
        if (p2Number >= offset && (!shouldLimit || p2Number < nextOffset!)) {
          // eslint-disable-next-line no-unused-vars
          for (const p3 in obj[p1][p2]) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * @protected
   * @param {Number} lineIndex
   * @param {Number} charIndex
   * @return {TextStyleDeclaration} a style object reference to the existing one or a new empty object when undefined
   */
  _getStyleDeclaration(
    lineIndex: number,
    charIndex: number,
  ): TextStyleDeclaration {
    if (this._styleMap && !this.isWrapping) {
      const map = this._styleMap[lineIndex];
      if (!map) {
        return {};
      }
      lineIndex = map.line;
      charIndex = map.offset + charIndex;
    }
    return super._getStyleDeclaration(lineIndex, charIndex);
  }

  /**
   * @param {Number} lineIndex
   * @param {Number} charIndex
   * @param {Object} style
   * @private
   */
  protected _setStyleDeclaration(
    lineIndex: number,
    charIndex: number,
    style: object,
  ) {
    const map = this._styleMap[lineIndex];
    super._setStyleDeclaration(map.line, map.offset + charIndex, style);
  }

  /**
   * @param {Number} lineIndex
   * @param {Number} charIndex
   * @private
   */
  protected _deleteStyleDeclaration(lineIndex: number, charIndex: number) {
    const map = this._styleMap[lineIndex];
    super._deleteStyleDeclaration(map.line, map.offset + charIndex);
  }

  /**
   * probably broken need a fix
   * Returns the real style line that correspond to the wrapped lineIndex line
   * Used just to verify if the line does exist or not.
   * @param {Number} lineIndex
   * @returns {Boolean} if the line exists or not
   * @private
   */
  protected _getLineStyle(lineIndex: number): boolean {
    const map = this._styleMap[lineIndex];
    return !!this.styles[map.line];
  }

  /**
   * Set the line style to an empty object so that is initialized
   * @param {Number} lineIndex
   * @param {Object} style
   * @private
   */
  protected _setLineStyle(lineIndex: number) {
    const map = this._styleMap[lineIndex];
    super._setLineStyle(map.line);
  }

  /**
   * Wraps text using the 'width' property of Textbox. First this function
   * splits text on newlines, so we preserve newlines entered by the user.
   * Then it wraps each line using the width of the Textbox by calling
   * _wrapLine().
   * @param {Array} lines The string array of text that is split into lines
   * @param {Number} desiredWidth width you want to wrap to
   * @returns {Array} Array of lines
   */
  _wrapText(lines: string[], desiredWidth: number): string[][] {
    this.isWrapping = true;
    // extract all thewords and the widths to optimally wrap lines.
    const data = this.getGraphemeDataForRender(lines);
    const wrapped: string[][] = [];
    for (let i = 0; i < data.wordsData.length; i++) {
      wrapped.push(...this._wrapLine(i, desiredWidth, data));
    }
    this.isWrapping = false;
    return wrapped;
  }

  /**
   * For each line of text terminated by an hard line stop,
   * measure each word width and extract the largest word from all.
   * The returned words here are the one that at the end will be rendered.
   * @param {string[]} lines the lines we need to measure
   *
   */
  getGraphemeDataForRender(lines: string[]): GraphemeData {
    const splitByGrapheme = this.splitByGrapheme,
      infix = splitByGrapheme ? '' : ' ';

    let largestWordWidth = 0;

    const data = lines.map((line, lineIndex) => {
      let offset = 0;
      const wordsOrGraphemes = splitByGrapheme
        ? this.graphemeSplit(line)
        : this.wordSplit(line);

      if (wordsOrGraphemes.length === 0) {
        return [{ word: [], width: 0 }];
      }

      return wordsOrGraphemes.map((word: string) => {
        // if using splitByGrapheme words are already in graphemes.
        const graphemeArray = splitByGrapheme
          ? [word]
          : this.graphemeSplit(word);
        const width = this._measureWord(graphemeArray, lineIndex, offset);
        largestWordWidth = Math.max(width, largestWordWidth);
        offset += graphemeArray.length + infix.length;
        return { word: graphemeArray, width };
      });
    });

    return {
      wordsData: data,
      largestWordWidth,
    };
  }

  /**
   * Helper function to measure a string of text, given its lineIndex and charIndex offset
   * It gets called when charBounds are not available yet.
   * Override if necessary
   * Use with {@link Textbox#wordSplit}
   *
   * @param {CanvasRenderingContext2D} ctx
   * @param {String} text
   * @param {number} lineIndex
   * @param {number} charOffset
   * @returns {number}
   */
  _measureWord(word: string[], lineIndex: number, charOffset = 0): number {
    let width = 0,
      prevGrapheme;
    const skipLeft = true;
    for (let i = 0, len = word.length; i < len; i++) {
      const box = this._getGraphemeBox(
        word[i],
        lineIndex,
        i + charOffset,
        prevGrapheme,
        skipLeft,
      );
      width += box.kernedWidth;
      prevGrapheme = word[i];
    }
    return width;
  }

  /**
   * Override this method to customize word splitting
   * Use with {@link Textbox#_measureWord}
   * @param {string} value
   * @returns {string[]} array of words
   */
  wordSplit(value: string): string[] {
    return value.split(this._wordJoiners);
  }

  /**
   * Wraps a line of text using the width of the Textbox as desiredWidth
   * and leveraging the known width o words from GraphemeData
   * @private
   * @param {Number} lineIndex
   * @param {Number} desiredWidth width you want to wrap the line to
   * @param {GraphemeData} graphemeData an object containing all the lines' words width.
   * @param {Number} reservedSpace space to remove from wrapping for custom functionalities
   * @returns {Array} Array of line(s) into which the given text is wrapped
   * to.
   */
  _wrapLine(
    lineIndex: number,
    desiredWidth: number,
    { largestWordWidth, wordsData }: GraphemeData,
    reservedSpace = 0,
  ): string[][] {
    const additionalSpace = this._getWidthOfCharSpacing(),
      splitByGrapheme = this.splitByGrapheme,
      graphemeLines = [],
      infix = splitByGrapheme ? '' : ' ';

    let lineWidth = 0,
      line: string[] = [],
      // spaces in different languages?
      offset = 0,
      infixWidth = 0,
      lineJustStarted = true;

    desiredWidth -= reservedSpace;

    const maxWidth = Math.max(
      desiredWidth,
      largestWordWidth,
      this.dynamicMinWidth,
    );
    // layout words
    const data = wordsData[lineIndex];
    offset = 0;
    let i;
    for (i = 0; i < data.length; i++) {
      const { word, width: wordWidth } = data[i];
      offset += word.length;

      lineWidth += infixWidth + wordWidth - additionalSpace;
      if (lineWidth > maxWidth && !lineJustStarted) {
        graphemeLines.push(line);
        line = [];
        lineWidth = wordWidth;
        lineJustStarted = true;
      } else {
        lineWidth += additionalSpace;
      }

      if (!lineJustStarted && !splitByGrapheme) {
        line.push(infix);
      }
      line = line.concat(word);

      infixWidth = splitByGrapheme
        ? 0
        : this._measureWord([infix], lineIndex, offset);
      offset++;
      lineJustStarted = false;
    }

    i && graphemeLines.push(line);

    // TODO: this code is probably not necessary anymore.
    // it can be moved out of this function since largestWordWidth is now
    // known in advance
    if (largestWordWidth + reservedSpace > this.dynamicMinWidth) {
      this.dynamicMinWidth = largestWordWidth - additionalSpace + reservedSpace;
    }
    return graphemeLines;
  }

  /**
   * Detect if the text line is ended with an hard break
   * text and itext do not have wrapping, return false
   * @param {Number} lineIndex text to split
   * @return {Boolean}
   */
  isEndOfWrapping(lineIndex: number): boolean {
    if (!this._styleMap[lineIndex + 1]) {
      // is last line, return true;
      return true;
    }
    if (this._styleMap[lineIndex + 1].line !== this._styleMap[lineIndex].line) {
      // this is last line before a line break, return true;
      return true;
    }
    return false;
  }

  /**
   * Detect if a line has a linebreak and so we need to account for it when moving
   * and counting style.
   * This is important only for splitByGrapheme at the end of wrapping.
   * If we are not wrapping the offset is always 1
   * @return Number
   */
  missingNewlineOffset(lineIndex: number, skipWrapping?: boolean): 0 | 1 {
    if (this.splitByGrapheme && !skipWrapping) {
      return this.isEndOfWrapping(lineIndex) ? 1 : 0;
    }
    return 1;
  }

  /**
   * Gets lines of text to render in the Textbox. This function calculates
   * text wrapping on the fly every time it is called.
   * @param {String} text text to split
   * @returns {Array} Array of lines in the Textbox.
   * @override
   */
  _splitTextIntoLines(text: string) {
    // James modified 存在path时候不按照宽度换行
    var wrapWidth = this.path ? 10000000 : this.width;
    // 如果width 不存在， 使用page width
    wrapWidth = wrapWidth || Textbox.defaultWrapWidth;
    const newText = super._splitTextIntoLines(text),
      graphemeLines = this._wrapText(newText.lines, wrapWidth),
      lines = new Array(graphemeLines.length);
    for (let i = 0; i < graphemeLines.length; i++) {
      lines[i] = graphemeLines[i].join('');
    }
    newText.lines = lines;
    newText.graphemeLines = graphemeLines;
    return newText;
  }

  getMinWidth() {
    return Math.max(this.minWidth, this.dynamicMinWidth);
  }

  _removeExtraneousStyles() {
    const linesToKeep = new Map();
    for (const prop in this._styleMap) {
      const propNumber = parseInt(prop, 10);
      if (this._textLines[propNumber]) {
        const lineIndex = this._styleMap[prop].line;
        linesToKeep.set(`${lineIndex}`, true);
      }
    }
    for (const prop in this.styles) {
      if (!linesToKeep.has(prop)) {
        delete this.styles[prop];
      }
    }
  }

  /**
   * Returns object representation of an instance
   * @method toObject
   * @param {Array} [propertiesToInclude] Any properties that you might want to additionally include in the output
   * @return {Object} object representation of an instance
   */
  toObject<
    T extends Omit<Props & TClassProperties<this>, keyof SProps>,
    K extends keyof T = never,
  >(propertiesToInclude: K[] = []): Pick<T, K> & SProps {
    return super.toObject<T, K>([
      'minWidth',
      'splitByGrapheme',
      ...propertiesToInclude,
    ] as K[]) as Pick<T, K> & SProps;
  }

  /**
   * Returns FabricText instance from an SVG element (<b>not yet implemented</b>)
   * @static
   * @memberOf Text
   * @param {HTMLElement} element Element to parse
   * @param {Object} [options] Options object
   */
  static async fromElement(
    element: HTMLElement,
    options: Abortable,
    cssRules?: CSSRules,
  ) {
    if (!element) {
      return null;
    }

    var parsedAttributes = parseAttributes(
      element,
      Textbox.ATTRIBUTE_NAMES,
      cssRules,
    );
    const textOptions = {
      ...(cssRules ? JSON.parse(JSON.stringify(cssRules)) : {}),
      ...parsedAttributes,
    };
    // 处理style中字体样式带单引号问题
    let reg = /^'(.*)'$/;
    if (reg.test(textOptions.fontFamily)) {
      textOptions.fontFamily = textOptions.fontFamily.slice(1, -1);
    }

    textOptions.top = textOptions.top || 0;
    textOptions.left = textOptions.left || 0;
    if (parsedAttributes.textDecoration) {
      var textDecoration = parsedAttributes.textDecoration;
      if (textDecoration.indexOf('underline') !== -1) {
        textOptions.underline = true;
      }
      if (textDecoration.indexOf('overline') !== -1) {
        textOptions.overline = true;
      }
      if (textDecoration.indexOf('line-through') !== -1) {
        textOptions.linethrough = true;
      }
      delete textOptions.textDecoration;
    }
    if ('dx' in parsedAttributes) {
      textOptions.left += parsedAttributes.dx;
    }
    if ('dy' in parsedAttributes) {
      textOptions.top += parsedAttributes.dy;
    }
    if (!('fontSize' in textOptions)) {
      textOptions.fontSize = DEFAULT_SVG_FONT_SIZE;
    }

    let text: Textbox;
    const paths = element.getElementsByTagName('textPath');
    if (paths.length) {
      text = this._fromTextPath(paths[0], textOptions, parsedAttributes);
    } else {
      text = this._fromTextSpan(element, textOptions, parsedAttributes);
    }
    return text;
  }

  static _findSvgTextPath(element: any, id: string) {
    const svg = element.closest('svg');
    return svg.querySelector(id);
  }

  static _fromTextPath = (
    textPath: any,
    options: any,
    parsedAttributes: { [key: string]: string },
  ): Textbox => {
    var parsedAnchor = parsedAttributes.textAnchor || 'left';

    var textPathParsedAttributes = parseAttributes(textPath, [
      'href',
      'text-anchor',
      'startOffset',
    ]);
    if (textPathParsedAttributes.textAnchor) {
      parsedAnchor = textPathParsedAttributes.textAnchor;
    }
    if (parsedAnchor === 'middle') {
      parsedAnchor = 'center';
    } else if (parsedAnchor === 'end') {
      parsedAnchor = 'right';
    }
    options.textAlign = parsedAnchor;

    var textContent = textPath.textContent;
    var text = new Textbox(textContent, options);

    const href = textPathParsedAttributes.href;
    if (href && href.startsWith('#')) {
      const pathElement = Textbox._findSvgTextPath(textPath, href);
      if (pathElement) {
        var pathParsedAttributes = parseAttributes(
          pathElement,
          Path.ATTRIBUTE_NAMES,
        );
        const path = new Path(pathParsedAttributes.d, {
          ...pathParsedAttributes,
          ...{
            strokeWidth: 1,
            stroke: '#ff0000',
            fill: null as any,
            visible: false,
          },
        });
        // 需要计算实际字体大小
        Textbox.enableCalcTextHeight = true;
        const textHeight =
          new Textbox('i', {
            fontFamily: options.fontFamily,
            fontSize: options.fontSize,
            fontStyle: options.fontStyle,
            fontWeight: options.fontWeight,
            width: undefined,
            height: undefined,
          }).height || 20;
        text.set({
          width: (path.width || 0) + textHeight * 2,
          height: (path.height || 0) + textHeight * 2,
          path,
          pathType: 'custom',
        } as any);
        // 取消自动计算文字高度
        Textbox.enableCalcTextHeight = false;
      }
    }
    // 设置位置中心点为左上角
    text.set({
      left: options.left - (text.width || 0) / 2,
      top: options.top - (text.height || 0) / 2,
    });
    return text;
  };

  static _fromTextSpan(
    element: any,
    options: any,
    parsedAttributes: { [key: string]: string },
  ): Textbox {
    var textContent = '';
    var parsedAnchor = parsedAttributes.textAnchor || 'left';
    // 是否需要根据tspan位置计算对齐
    let calcHorAlign = !parsedAttributes.textAnchor;
    let calcAdjustHorAlign = '';

    // The XML is not properly parsed in IE9 so a workaround to get
    // textContent is through firstChild.data. Another workaround would be
    // to convert XML loaded from a file to be converted using DOMParser (same way loadSVGFromString() does)

    let lineCnt = 1;
    let alignmentBaseline = 'auto';
    let spanOffX = 0,
      minSpanX: number | null = null,
      spanOffY = 0;

    if (element.hasAttribute('line-height')) {
      options.lineHeight = parseFloat(element.getAttribute('line-height'));
    } else if (options['line-height']) {
      // 从style 转换过来
      options.lineHeight = parseFloat(options['line-height']) / 100;
    } else {
      options.lineHeight = 1;
    }

    if (!('textContent' in element)) {
      if ('firstChild' in element && element.firstChild !== null) {
        if ('data' in element.firstChild && element.firstChild.data !== null) {
          textContent = element.firstChild.data;
        }
      }
    } else {
      textContent = element.textContent;
      let spans = element.getElementsByTagName('tspan');
      if (spans.length > 0) {
        // 多行文字
        let lines: {
            text: string;
            left: number;
            width?: number;
            right?: number;
          }[] = [],
          lineText = '',
          curLineLeft = 0, // 本行的 水平方向位置
          preSpanTop = 0, // 前一个tspan的 垂直方向位置
          sumDx = 0,
          sumDy = 0;
        for (let i = 0; i < spans.length; i++) {
          var parsedSpanAttributes = parseAttributes(
            spans[i],
            Textbox.ATTRIBUTE_NAMES,
          );

          sumDx += Number(parsedSpanAttributes.dx) || 0;
          sumDy += Number(parsedSpanAttributes.dy) || 0;
          // 在使用tspan判断对齐时spanX取最小的值
          if ('left' in parsedSpanAttributes) {
            let spanX = parseFloat(parsedSpanAttributes.left);
            minSpanX = minSpanX != null ? Math.min(minSpanX, spanX) : spanX;
          }
          // 现在多个tspan用多行文字, 所以对齐和位置只处理第一个 tspan
          if (i === 0) {
            if (spans[i].hasAttribute('text-anchor')) {
              // 水平方向
              let anchor = spans[i].getAttribute('text-anchor');
              // left | center | right
              // start | middle | end
              if (anchor === 'middle') {
                parsedAnchor = 'center';
              } else if (anchor === 'end') {
                parsedAnchor = 'right';
              }
              calcHorAlign = false;
            }
            if (spans[i].hasAttribute('alignment-baseline')) {
              // 垂直方向
              alignmentBaseline = spans[i].getAttribute('alignment-baseline');
            }

            // 处理tspan设置的位置和偏移
            // top只处理第一行
            if ('top' in parsedSpanAttributes) {
              let spanY = parseFloat(parsedSpanAttributes.top);
              spanY += sumDy;

              spanOffY = options.top - spanY;
            }
          }

          // 多个tspan可能在一行 根据 y position判断是否换行
          // 另外没有对齐方式的，计算判断对齐方式，根据left的值判断对齐方式
          (parsedSpanAttributes as any).left =
            Number(parsedSpanAttributes.left || 0) + sumDx;
          (parsedSpanAttributes as any).top =
            Number(parsedSpanAttributes.top || 0) + sumDy;

          if (i === 0 || preSpanTop === (parsedSpanAttributes as any).top) {
            lineText += spans[i].textContent;
            if (i === 0) {
              curLineLeft = Number((parsedSpanAttributes as any).left || 0);
            }
          } else {
            lines.push({ text: lineText, left: curLineLeft });
            lineText = spans[i].textContent;
            curLineLeft = Number((parsedSpanAttributes as any).left || 0);
          }

          // 记住上一个span的Y位置
          preSpanTop = (parsedSpanAttributes as any).top;
        }
        // 加上最后一行
        if (lineText.length) {
          lines.push({ text: lineText, left: curLineLeft });
        }
        // 加上换行符号
        textContent = lines.map((v) => v.text).join('\n');
        lineCnt = lines.length;

        if (calcHorAlign) {
          if (lines.some((v) => v.left !== curLineLeft)) {
            // 取最left的最小值,和right最大值
            let minLeft = lines[0].left,
              maxRight = lines[0].left,
              maxWidth = 0,
              minCenter: number | null = null,
              maxCenter: number | null = null,
              maxChar = 0,
              maxCharIdx = 0;

            lines.forEach((v, idx) => {
              minLeft = Math.min(minLeft, v.left);
              v.width = new Textbox(v.text, options).calcTextWidth();
              v.right = v.left + (v.width || 0);
              maxRight = Math.max(maxRight, v.right);
              maxWidth = Math.max(maxWidth, v.width || 0);
              if (v.width) {
                const center = v.left + (v.width || 0) / 2;
                minCenter = minCenter ? Math.min(minCenter, center) : center;
                maxCenter = maxCenter ? Math.max(maxCenter, center) : center;

                if (v.text.length > maxChar) {
                  maxChar = v.text.length;
                  maxCharIdx = idx;
                }
              }
            });
            let leftGap = 0,
              rightGap = 0;
            lines.forEach((v) => {
              leftGap = Math.max(leftGap, (v.left || 0) - minLeft);
              rightGap = Math.max(rightGap, maxRight - (v.right || 0));
            });
            // 计算中心点位置
            if (maxCenter !== null && minCenter !== null) {
              const centerOff = maxCenter - minCenter;
              const onCharWidth =
                (lines[maxCharIdx].width || 0) / lines[maxCharIdx].text.length;
              // 左边间距大于右边两倍 或者 中心点偏移超过1/2字符且右边间距小于1/3字符
              if (
                leftGap / (rightGap || 1) > 2 &&
                centerOff > onCharWidth / 2 &&
                rightGap < onCharWidth / 3
              ) {
                calcAdjustHorAlign = 'right';
              } else if (centerOff < onCharWidth / 2) {
                calcAdjustHorAlign = 'center';
              }
            }
          }
        }
      }
    }

    // 处理文字的水平偏移
    spanOffX = options.left - (minSpanX || 0);

    // textAlign保持和parsedAnchor一致
    options.textAlign = parsedAnchor;

    // 注释掉原来删除换行等符号的代码
    //textContent = textContent.replace(/^\s+|\s+$|\n+/g, '').replace(/\s+/g, ' ');
    var originalStrokeWidth = options.strokeWidth;
    options.strokeWidth = 0;

    // 导入时打开自动计算文字高度，否则文字高度和 Y 轴位置错误
    Textbox.enableCalcTextHeight = true;
    var text = new Textbox(textContent, options),
      textOneLineHeight = text.height / lineCnt,
      textHeightScaleFactor = text.getScaledHeight() / text.height,
      lineHeightDiff =
        (textOneLineHeight + text.strokeWidth) * text.lineHeight -
        textOneLineHeight,
      scaledDiff = lineHeightDiff * textHeightScaleFactor,
      textHeight = text.getScaledHeight() / lineCnt + scaledDiff,
      offX = 0,
      offY = 0;

    // 默认 alignment-baseline="before-edge" offY = 0
    let offScale = 0;
    if (alignmentBaseline === 'before-edge') {
      // 这个是1.0 导出的偏移值，多行且间距设置大于1也会有变化
      // 暂时这么处理， 以后再解决
      offScale = 1.1;
    } else if (alignmentBaseline === 'auto') {
      // alignment-baseline="auto" 或者 没有设置
      offScale = 0.02913333333;
    }

    if (offScale !== 0) {
      offY =
        (textHeight - text.fontSize * (offScale + text._fontSizeFraction)) /
        text.lineHeight;
    }

    // 取消自动计算文字高度
    Textbox.enableCalcTextHeight = false;
    /*
      Adjust positioning:
        x/y attributes in SVG correspond to the bottom-left corner of text bounding box
        fabric output by default at top, left.
    */
    const adjustOption: Partial<ITextProps> = {};
    // 源码中options.width总是等于svg的宽度, 之前是new Text不能编辑文字，宽度设置为svg宽度也无效
    // 修改为 new fabric.Textbox，并且设置为计算的正确宽度
    const originWidth = options.width;
    let width = text.calcTextWidth();
    // 有时候计算出来的大小是不对的， 可能是字体的原因， 导致TextBox自动换行了, 所以加i字符的宽度
    const oneIWidth = (new Textbox('i', options) as any).calcTextWidth();
    width += oneIWidth;

    if (originWidth !== width) {
      adjustOption.width = width;
    }
    if (calcAdjustHorAlign) {
      // tspan 按字符分开计算的对齐
      adjustOption.textAlign = calcAdjustHorAlign;
    }

    // 2021.1.29修改
    // Vectr1.0导出的svg，需要处理水平居中或右对齐偏移
    // Vectr2.0导出的是按照span位置判断的对齐不需要处理整个width的位置偏移， 但是需要处理 oneIWidth的位置偏移
    const textAlign = calcAdjustHorAlign || parsedAnchor;
    if (textAlign === 'center') {
      offX = (parsedAnchor === 'center' ? width : oneIWidth) / 2;
    } else if (textAlign === 'right') {
      offX = parsedAnchor === 'right' ? width : oneIWidth;
    }

    text.set({
      ...adjustOption,
      left: text.left - offX - spanOffX,
      top: text.top - offY - spanOffY,
      strokeWidth:
        typeof originalStrokeWidth !== 'undefined' ? originalStrokeWidth : 1,
    });
    return text;
  }
}

classRegistry.setClass(Textbox);
classRegistry.setSVGClass(Textbox);
