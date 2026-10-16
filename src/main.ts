const imageProxy = "$&https://wsrv.nl/?output=webp&url=";

function toStyle(styles: Record<string, string>) {
  return Object.entries(styles)
    .map(([key, value]) => `${key}: ${value};`)
    .join(" ");
}

const removeElement = {
  element(element) {
    element.remove();
  },
} satisfies HTMLRewriterElementContentHandlers;

function replaceAttribute(
  name: string,
  search: string | RegExp,
  replace: string,
) {
  return {
    element(element) {
      const attribute = element.getAttribute(name)!;
      element.setAttribute(name, attribute.replace(search, replace));
    },
  } satisfies HTMLRewriterElementContentHandlers;
}

class TextReplacer {
  #buffer = "";

  constructor(
    private readonly search: string | RegExp,
    private readonly replace: string,
  ) {}

  text(element: Text) {
    this.#buffer += element.text;

    if (element.lastInTextNode) {
      element.replace(this.#buffer.replace(this.search, this.replace));
    } else {
      element.remove();
    }
  }
}

export default {
  async fetch(request, { CHANNEL }) {
    const { url, method } = request;
    const { origin } = new URL(url);

    const proxyRequest = (target = "https://t.me") =>
      fetch(url.replace(origin, target), request);

    const Root = new URLPattern({ pathname: `/{${CHANNEL}}?` });
    const Post = new URLPattern({ pathname: `/${CHANNEL}/*` });
    const List = new URLPattern({ pathname: `/s/${CHANNEL}` });
    const Context = new URLPattern({ pathname: `/s/${CHANNEL}/*` });
    const Video = new URLPattern({
      pathname: "/cdn(\\d).telesco.pe/file/*.mp4",
    });
    const Emoji = new URLPattern({ pathname: "/i/emoji/*" });
    const View = new URLPattern({ pathname: "/v/" });

    const rewriter = new HTMLRewriter()
      .on(
        'link[rel*="icon"]',
        removeElement,
      )
      .on(
        'link[href^="//telegram.org/css/font-roboto.css"]',
        removeElement,
      )
      .on(
        'script[src^="https://oauth.tg.dev/js/telegram-widget.js"]',
        removeElement,
      )
      .on(
        [
          // List: join button in header (visible on mobile)
          ".tgme_channel_join_telegram",
          // List: download button in channel info
          ".tgme_channel_download_telegram",
          // List: footer in channel info
          ".tgme_footer",
          // Post: download button in header
          ".tgme_head_right_btn",
          // Post: card logo
          ".tgme_widget_message_bubble_logo",
        ].join(),
        removeElement,
      )
      .on(
        "title",
        new TextReplacer(/ – Telegram|Telegram: /, ""),
      )
      .on(
        ".tgme_head_brand",
        {
          element(element) {
            element.setAttribute("href", "/");
            element.setAttribute(
              "style",
              toStyle({
                color: "unset",
                "font-size": "20px",
                "font-weight": "500",
                transform: "translateY(50%)",
              }),
            );
            element.setInnerContent("Channel");
          }
        },
      )
      .on(
        'link[href^="//telegram.org/css/bootstrap.min.css"]',
        replaceAttribute(
          "href",
          /.*/,
          // Telegram uses customized 3.2.0
          "https://unpkg.com/bootstrap@3.2.0/dist/css/bootstrap.min.css",
        ),
      )
      .on(
        'script[src="//telegram.org/js/jquery.min.js"]',
        replaceAttribute(
          "src",
          /.*/,
          "https://unpkg.com/jquery@1.11.1/dist/jquery.min.js",
        ),
      )
      .on(
        'script[src="//telegram.org/js/jquery-ui.min.js"]',
        replaceAttribute(
          "src",
          /.*/,
          // Telegram uses customized 1.11.4 (unavailable via CDN)
          "https://unpkg.com/jquery-ui-dist@1.12.0/jquery-ui.min.js",
        ),
      )
      .on(
        'link[rel="stylesheet"]',
        replaceAttribute("href", "//telegram.org", ""),
      )
      .on(
        'script[src*="telegram.org"]',
        replaceAttribute("src", /(https:)?\/\/telegram\.org/, ""),
      )
      .on(
        // Post image & emoji
        '[style*="background-image"]',
        replaceAttribute("style", "url('", imageProxy),
      )
      .on(
        // Avatar
        "img",
        replaceAttribute("src", "", imageProxy),
      )
      .on(
        [
          'meta[property="og:image"]',
          'meta[property="twitter:image"]',
        ].join(),
        replaceAttribute("content", "", imageProxy),
      )
      .on(
        "video",
        replaceAttribute("src", "https:/", ""),
      )
      .on(
        `a[href^="https://t.me/${CHANNEL}"]`,
        replaceAttribute("href", "https://t.me", ""),
      );

    if (Root.test(url)) {
      return Response.redirect(`${origin}/s/${CHANNEL}`);
    }

    if (Post.test(url) || Context.test(url)) {
      const response = await proxyRequest();
      return rewriter.transform(response);
    }

    if (List.test(url)) {
      const response = await proxyRequest();

      if (method !== "POST") {
        return rewriter.transform(response);
      }

      const html = await response.json<string>();
      const transformed = await rewriter.transform(new Response(html)).text();
      return Response.json(transformed, response);
    }

    if (Video.test(url)) {
      return proxyRequest("https:/");
    }

    if (Emoji.test(url)) {
      const response = await proxyRequest();
      const data = await response.json<{ emoji: string; thumb: string }>();
      const transformed = {
        ...data,
        emoji: data.emoji.replace("", imageProxy),
        thumb: data.thumb.replace("", imageProxy),
      };
      return Response.json(transformed, response);
    }

    if (View.test(url)) {
      return proxyRequest();
    }

    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
