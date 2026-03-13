(function (global) {
  "use strict";

function createFuriganaMD() {
  "use strict";

  // This function escapes special characters for use in a regex constructor.
  function escapeForRegex(string) {
    return string.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  }

  function emptyStringFilter(block) {
    return block !== "";
  }

  const kanjiRange = "\\u4e00-\\u9faf";
  const kanjiBlockRegex = new RegExp(`[${kanjiRange}]+`, "g");
  const nonKanjiBlockRegex = new RegExp(`[^${kanjiRange}]+`, "g");
  const kanaWithAnnotations =
    "\\u3041-\\u3095\\u3099-\\u309c\\u3081-\\u30fa\\u30fc";
  const furiganaSeperators = ".．。・";
  const seperatorRegex = new RegExp(`[${furiganaSeperators}]`, "g");

  const singleKanjiRegex = new RegExp(`^[${kanjiRange}]$`);

  function isKanji(character) {
    return character.match(singleKanjiRegex);
  }

  const innerRegexString = "(?:[^\\u0000-\\u007F]|\\w)+";

  let regexList = [];
  let previousFuriganaForms = "";

  function updateRegexList(furiganaForms) {
    previousFuriganaForms = furiganaForms;
    let formArray = furiganaForms.split("|");
    if (formArray.length === 0) {
      formArray = ["[]:^:()"];
    }
    regexList = formArray.map((form) => {
      let furiganaComponents = form.split(":");
      if (furiganaComponents.length !== 3) {
        furiganaComponents = ["[]", "^", "()"];
      }
      const mainBrackets = furiganaComponents[0];
      const seperator = furiganaComponents[1];
      const furiganaBrackets = furiganaComponents[2];
      return new RegExp(
        escapeForRegex(mainBrackets[0]) +
          "(" +
          innerRegexString +
          ")" +
          escapeForRegex(mainBrackets[1]) +
          escapeForRegex(seperator) +
          escapeForRegex(furiganaBrackets[0]) +
          "(" +
          innerRegexString +
          ")" +
          escapeForRegex(furiganaBrackets[1]),
        "g"
      );
    });
  }

  let autoRegexList = [];
  let previousAutoBracketSets = "";

  function updateAutoRegexList(autoBracketSets) {
    previousAutoBracketSets = autoBracketSets;
    autoRegexList = autoBracketSets.split("|").map((brackets) => {
      /*
        Sample built regex:
        /(^|[^\u4e00-\u9faf]|)([\u4e00-\u9faf]+)([\u3041-\u3095\u3099-\u309c\u3081-\u30fa\u30fc]*)【((?:[^【】\u4e00-\u9faf]|w)+)】/g
      */
      return new RegExp(
        `(^|[^${kanjiRange}]|)` +
          `([${kanjiRange}]+)` +
          `([${kanaWithAnnotations}]*)` +
          escapeForRegex(brackets[0]) +
          `((?:[^${escapeForRegex(
            brackets
          )}\\u0000-\\u007F]|\\w|[${furiganaSeperators}])+)` +
          escapeForRegex(brackets[1]),
        "g"
      );
    });
  }

  let replacementTemplate = "";
  let replacementBrackets = "";

  function updateReplacementTemplate(furiganaFallbackBrackets) {
    if (furiganaFallbackBrackets.length !== 2) {
      furiganaFallbackBrackets = "【】";
    }
    replacementBrackets = furiganaFallbackBrackets;
    replacementTemplate = `<ruby>$1<rp>${furiganaFallbackBrackets[0]}</rp><rt style="line-height:1;font-size:10px;">$2</rt><rp>${furiganaFallbackBrackets[1]}</rp></ruby>`;
  }

  updateReplacementTemplate("【】");

  function addFurigana(text, options) {
    if (options.furiganaForms !== previousFuriganaForms) {
      updateRegexList(options.furiganaForms);
    }
    if (options.furiganaFallbackBrackets !== replacementBrackets) {
      updateReplacementTemplate(options.furiganaFallbackBrackets);
    }
    regexList.forEach((regex) => {
      text = text.replace(
        regex,
        (match, wordText, furiganaText, offset, mainText) => {
          if (match.indexOf("\\") === -1 && mainText[offset - 1] !== "\\") {
            if (
              !options.furiganaPatternMatching ||
              wordText.search(kanjiBlockRegex) === -1 ||
              wordText[0].search(kanjiBlockRegex) === -1
            ) {
              return replacementTemplate
                .replace("$1", wordText)
                .replace("$2", furiganaText);
            } else {
              let originalFuriganaText = (" " + furiganaText).slice(1);
              let nonKanji = wordText
                .split(kanjiBlockRegex)
                .filter(emptyStringFilter);
              let kanji = wordText
                .split(nonKanjiBlockRegex)
                .filter(emptyStringFilter);
              let replacementText = "";
              let lastUsedKanjiIndex = 0;
              if (nonKanji.length === 0) {
                return replacementTemplate
                  .replace("$1", wordText)
                  .replace("$2", furiganaText);
              }

              nonKanji.forEach((currentNonKanji, index) => {
                if (furiganaText === undefined) {
                  if (index < kanji.length) {
                    replacementText += kanji[index];
                  }

                  replacementText += currentNonKanji;
                  return;
                }
                let splitFurigana = furiganaText
                  .split(new RegExp(escapeForRegex(currentNonKanji) + "(.*)"))
                  .filter(emptyStringFilter);

                lastUsedKanjiIndex = index;
                replacementText += replacementTemplate
                  .replace("$1", kanji[index])
                  .replace("$2", splitFurigana[0]);
                replacementText += currentNonKanji;

                furiganaText = splitFurigana[1];
              });
              if (
                furiganaText !== undefined &&
                lastUsedKanjiIndex + 1 < kanji.length
              ) {
                replacementText += replacementTemplate
                  .replace("$1", kanji[lastUsedKanjiIndex + 1])
                  .replace("$2", furiganaText);
              } else if (furiganaText !== undefined) {
                return replacementTemplate
                  .replace("$1", wordText)
                  .replace("$2", originalFuriganaText);
              } else if (lastUsedKanjiIndex + 1 < kanji.length) {
                replacementText += kanji[lastUsedKanjiIndex + 1];
              }
              return replacementText;
            }
          } else {
            return match;
          }
        }
      );
    });

    if (!options.furiganaStrictMode) {
      if (options.furiganaAutoBracketSets !== previousAutoBracketSets) {
        updateAutoRegexList(options.furiganaAutoBracketSets);
      }
      autoRegexList.forEach((regex) => {
        text = text.replace(
          regex,
          (
            match,
            preWordTerminator,
            wordKanji,
            wordKanaSuffix,
            furiganaText,
            offset,
            mainText
          ) => {
            if (match.indexOf("\\") === -1) {
              if (options.furiganaPatternMatching) {
                let rubies = [];

                let furigana = furiganaText;

                let stem = (" " + wordKanaSuffix).slice(1);
                for (let i = furiganaText.length - 1; i >= 0; i--) {
                  if (wordKanaSuffix.length === 0) {
                    furigana = furiganaText.substring(0, i + 1);
                    break;
                  }
                  if (furiganaText[i] !== wordKanaSuffix.slice(-1)) {
                    furigana = furiganaText.substring(0, i + 1);
                    break;
                  }
                  wordKanaSuffix = wordKanaSuffix.slice(0, -1);
                }

                if (
                  furiganaSeperators
                    .split("")
                    .reduce((noSeperator, seperator) => {
                      return noSeperator && furigana.indexOf(seperator) === -1;
                    }, true)
                ) {
                  rubies = [
                    replacementTemplate
                      .replace("$1", wordKanji)
                      .replace("$2", furigana),
                  ];
                } else {
                  let kanaParts = furigana.split(seperatorRegex);
                  let kanji = wordKanji.split("");
                  if (
                    kanaParts.length === 0 ||
                    kanaParts.length > kanji.length
                  ) {
                    rubies = [
                      replacementTemplate
                        .replace("$1", wordKanji)
                        .replace("$2", furigana),
                    ];
                  } else {
                    for (let i = 0; i < kanaParts.length - 1; i++) {
                      if (kanji.length === 0) {
                        break;
                      }
                      rubies.push(
                        replacementTemplate
                          .replace("$1", kanji.shift())
                          .replace("$2", kanaParts[i])
                      );
                    }
                    let lastKanaPart = kanaParts.pop();
                    rubies.push(
                      replacementTemplate
                        .replace("$1", kanji.join(""))
                        .replace("$2", lastKanaPart)
                    );
                  }
                }

                return preWordTerminator + rubies.join("") + stem;
              } else {
                return (
                  preWordTerminator +
                  replacementTemplate
                    .replace("$1", wordKanji)
                    .replace("$2", furiganaText) +
                  wordKanaSuffix
                );
              }
            } else {
              return match;
            }
          }
        );
      });
    }
    return text;
  }

  function handleEscapedSpecialBrackets(text) {
    // By default 【 and 】 cannot be escaped in markdown, this will remove backslashes from in front of them to give that effect.
    return text.replace(/\\([【】])/g, "$1");
  }

  let FuriganaMD = {};
  FuriganaMD.register = function (renderer) {
    renderer.text = function (text) {
      let options = {
        furigana: true,
        furiganaForms: "()::{}",
        furiganaFallbackBrackets: "{}",
        furiganaStrictMode: false,
        furiganaAutoBracketSets: "{}",
        furiganaPatternMatching: true,
      };
      // console.log('override text render',text);
      // console.log('after add',addFurigana(text, options));
      return handleEscapedSpecialBrackets(addFurigana(text, options));
    };
  };

  return FuriganaMD;
}

const FuriganaMD = createFuriganaMD();

const WxRenderer = function () {
  let ENV_USE_REFERENCES = true;
  let ENV_STRETCH_IMAGE = true;

  let footnotes = [];
  let footnoteIndex = 0;

  let addFootnote = function (title, link) {
    footnoteIndex += 1;
    footnotes.push([footnoteIndex, title, link]);
    return footnoteIndex;
  };

  this.buildFootnotes = function () {
    let footnoteArray = footnotes.map(function (x) {
      return `<section class="footnote-item"><span class="footnote-num">[${x[0]}] </span><p>${x[1]}: <em>${x[2]}</em></p></section>`;
    });
    return `<h3><span class="prefix"></span><span class="content">本文内链接</span><span class="suffix"></span></h3><section class="footnotes">${footnoteArray.join(
      "\n"
    )}</section>`;
  };

  this.buildAddition = function () {
    return (
      "<style>.preview-wrapper pre::before{" +
      'font-family:"SourceSansPro","HelveticaNeue",Arial,sans-serif;' +
      "position:absolute;" +
      "top:0;" +
      "right:0;" +
      "color:#ccc;" +
      "text-align:right;" +
      "font-size:0.8em;" +
      "padding:5px10px0;" +
      "line-height:15px;" +
      "height:15px;" +
      "font-weight:600;" +
      "}</style>"
    );
  };

  this.hasFootnotes = function () {
    return footnotes.length !== 0;
  };

  this.getRenderer = function () {
    footnotes = [];
    footnoteIndex = 0;

    let renderer = new marked.Renderer();
    FuriganaMD.register(renderer);

    renderer.heading = function (text, level) {
      switch (level) {
        case 1:
          return `<h1><span class="prefix"></span><span class="content">${text}</span><span class="suffix"></span></h1>`;
        case 2:
          return `<h2><span class="prefix"></span><span class="content">${text}</span><span class="suffix"></span></h2>`;
        case 3:
          return `<h3><span class="prefix"></span><span class="content">${text}</span><span class="suffix"></span></h3>`;
        default:
          return `<h4><span class="prefix"></span><span class="content">${text}</span><span class="suffix"></span></h4>`;
      }
    };
    renderer.paragraph = function (text) {
      if (text.indexOf("<figure>") === 0) {
        return text;
      }
      return `<p>${text}</p>`;
    };
    renderer.blockquote = function (text) {
      return `<blockquote class="important">${text}</blockquote>`;
    };
    renderer.code = function (text, infoString) {
      text = text.replace(/</g, "&lt;");
      text = text.replace(/>/g, "&gt;");

      let lines = text.split("\n");
      let codeLines = [];
      let numbers = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        codeLines.push(
          `<code class="prettyprint"><span class="code-snippet_outer">${
            line || "<br>"
          }</span></code>`
        );
        numbers.push("<li></li>");
      }
      let lang = infoString || "";
      return (
        `<section class="code-snippet__fix code-snippet__js">` +
        `<ul class="code-snippet__line-index code-snippet__js">${numbers.join(
          ""
        )}</ul>` +
        `<pre class="code-snippet__js" data-lang="${lang}">` +
        codeLines.join("") +
        `</pre></section>`
      );
    };
    renderer.codespan = function (text, infoString) {
      return `<code>${text}</code>`;
    };
    renderer.listitem = function (text) {
      return `<span class="listitem"><span style="margin-right: 6px;"><%s/></span>${text}</span>`;
    };
    renderer.list = function (text, ordered, start) {
      text = text.replace(/<\/*p.*?>/g, "");
      let segments = text.split(`<%s/>`);
      if (!ordered) {
        text = segments.join("•");
        return `<section class="ul">${text}</section>`;
      }
      text = segments[0];
      for (let i = 1; i < segments.length; i++) {
        text = text + i + "." + segments[i];
      }
      return `<section class="ol">${text}</section>`;
    };
    renderer.image = function (href, title, text) {
      const subText = `<figcaption>${text}</figcaption>`;

      return `<figure><img class="image" src="${href}" title="${title}" alt="${text}"/>${subText}</figure>`;
    };
    renderer.link = function (href, title, text) {
      if (href.indexOf("https://mp.weixin.qq.com") === 0) {
        return `<a href="${href}" title="${title || text}">${text}</a>`;
      } else if (href.indexOf("#") === 0) {
        return text;
      } else if (href === text) {
        return text;
      } else {
        if (ENV_USE_REFERENCES) {
          let ref = addFootnote(title || text, href);
          return `<span class="footnote-word">${text}<sup class="footnote-ref">[${ref}]</sup></span>`;
        } else {
          return `<a href="${href}" title="${title || text}">${text}</a>`;
        }
      }
    };
    renderer.strong = function (text) {
      return `<strong>${text}</strong>`;
    };
    renderer.em = function (text) {
      return `<em>${text}</em>`;
    };
    renderer.table = function (header, body) {
      return `<table><thead>${header}</thead><tbody>${body}</tbody></table>`;
    };
    renderer.tablecell = function (text, flags) {
      return `<td>${text}</td>`;
    };
    renderer.hr = function () {
      return `<hr />`;
    };
    return renderer;
  };
};

  function renderWechatMarkdown(source) {
    const wxRenderer = new WxRenderer();
    let output = marked(source, { renderer: wxRenderer.getRenderer() });
    if (wxRenderer.hasFootnotes()) {
      output = output.replace(/(style=".*?)"/, '$1;margin-top: 0"');
      output += wxRenderer.buildFootnotes();
      output += wxRenderer.buildAddition();
    }
    return output;
  }

  function runWechatPrettyPrint() {
    if (global.PR && typeof global.PR.prettyPrint === "function") {
      global.PR.prettyPrint();
    }
  }

  function extractWechatCssRules() {
    const rules = [];
    if (!global.document || !global.document.styleSheets) {
      return "";
    }

    for (const sheet of global.document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule instanceof global.CSSStyleRule || rule instanceof global.CSSMediaRule) {
            rules.push(rule.cssText);
          }
        }
      } catch (err) {
        // Ignore cross-origin or inaccessible stylesheets.
      }
    }

    return rules.join("\n");
  }

  function exportWechatHtml(rootId) {
    const id = rootId || "md-root";
    if (!global.document) {
      return "";
    }

    const root = global.document.getElementById(id);
    if (!root) {
      return "";
    }

    if (typeof global.inlineCss !== "function") {
      return root.outerHTML;
    }

    const cssText = extractWechatCssRules();
    return global.inlineCss(root.outerHTML, cssText);
  }

  global.MD2WEIXIN_INLINE_OPTIONS = {
  "applyStyleTags": true,
  "removeStyleTags": true,
  "preserveMediaQueries": false,
  "preserveFontFaces": false,
  "applyWidthAttributes": false,
  "applyHeightAttributes": false,
  "applyAttributesTableElements": false,
  "inlinePseudoElements": true,
  "xmlMode": false,
  "preserveImportant": false
};
  global.FuriganaMD = FuriganaMD;
  global.WxRenderer = WxRenderer;
  global.renderWechatMarkdown = renderWechatMarkdown;
  global.runWechatPrettyPrint = runWechatPrettyPrint;
  global.extractWechatCssRules = extractWechatCssRules;
  global.exportWechatHtml = exportWechatHtml;
})(typeof globalThis !== "undefined" ? globalThis : window);
