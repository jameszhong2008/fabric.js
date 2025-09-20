import { getMultipleNodes } from './getMultipleNodes';
import { parseTransformAttribute } from './parseTransformAttribute';
import { multiplyTransformMatrices } from '../util/misc/matrix';
import type { TMat2D } from '../typedefs';
import { PatternOptions } from '../Pattern';

/**
 * Parse all pattern found in it
 * @param {*} doc
 */
export function getPatternDefs(doc: Document) {
  var tagArray = ["pattern"],
    elList = getMultipleNodes(doc, tagArray),
    el,
    j = 0;
  const patternDefs: Record<string, PatternOptions> = {};
  j = elList.length;
  while (j--) {
    el = elList[j];
    const id = el.getAttribute("id");
    if (id) {
      var elNew = parsePattern(doc, el);
      if (elNew) {
        patternDefs[id] = elNew;
      }
    }
  }
  return patternDefs;
}

/**
 * parse pattern
 * @param {*} doc
 * @param {*} el
 */
function parsePattern(doc: Document, el: Element) {
  var svgToPattern = function (node: Element, parentTransform: TMat2D) {
    if (node.nodeType === 3) return;

    var nodeTranform =
      node.getAttribute(
        node.nodeName === "pattern" ? "patternTransform" : "transform"
      ) || "";
    var transformMatrix = parseTransformAttribute(nodeTranform);

    parentTransform = multiplyTransformMatrices(
      parentTransform,
      transformMatrix
    );

    /**
     * 解析子节点
     * @param node 
     */
    const parseChildNodes = (node: Element) => {
      for (var i = 0; i < node.childNodes.length; i++) {
        const child =node.childNodes[i];
        if (child instanceof Element) 
        svgToPattern(child, parentTransform);
      }
    }
    // switch 直接用它的子节点
    if (node.nodeName == "switch") {
      parseChildNodes(node);
    } else if (node.nodeName === "g" || node.nodeName === "pattern") {
      parseChildNodes(node);
    } else if (node.nodeName === "clipPath") {
      // 取得pattern的clippath
      // 暂不处理
    } else if (node.nodeName === "image") {
      patternNode = {
        source: node.getAttribute("xlink:href"),
        patternTransform: parentTransform,
      };
    }
  };
  // 开始解析SVG
  var patternNode,
    clipPath,
    parentTransform: TMat2D = [1, 0, 0, 1, 0, 0];
  svgToPattern(el, parentTransform);
  return patternNode;
}