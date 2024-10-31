import { createServerAdapter } from '@whatwg-node/server'
import { AutoRouter, html } from 'itty-router'
import { parseHTML } from 'linkedom'

const channel = 'kichann'

function changeOrigin(url: string) {
  return url.replace(new URL(url).origin, 'https://t.me')
}

function handler(url: string) {
  return fetch(url)
    .then(response => response.text())
    .then(processHTML)
    .then(html)
}

function processHTML(html: string) {
  const { document } = parseHTML(html
    // Replace internal channel links
    .replaceAll(`href="https://t.me/${channel}"`, 'href="/"')
    .replace(new RegExp(`href="https:\/\/t\.me(?=\/${channel}\/)`, 'g'), 'href="')
    // Proxy assets via Vercel
    .replace(/(https:)?\/\/(?=telegram\.org\/(css|js|img))|https:\/\/(?=cdn\d\.cdn-telegram\.org)/g, '/')
    // Proxy images via wsrv.nl
    // Must come after assets replacement
    .replace(/\/(?=cdn\d\.cdn-telegram\.org.+\.jpg)/g, 'https://wsrv.nl/?output=webp&url=https://'),
  )

  // Note the selector is different after assets replacement
  for (const element of document.querySelectorAll([
    'link[href^="/telegram.org/css/font-roboto.css"]',
    // Nested widget script
    'script[src^="https://oauth.tg.dev/js/telegram-widget.js"]',
  ].join())) {
    element.remove()
  }

  // Remove default Emoji images
  for (const emoji of document.querySelectorAll('.emoji')) {
    // Keep `.emoji` wrapper for custom Emoji
    // Example: https://t.me/kichann/2300
    if (emoji.parentElement!.localName === 'tg-emoji') {
      emoji.removeAttribute('style')
    }
    // Default Emoji
    // Example: https://t.me/kichann/2312
    else {
      emoji.replaceWith(emoji.textContent!)
    }
  }

  return String(document)
}

const router = AutoRouter()

// List (including search)
router.get('/', () => handler(`https://t.me/s/${channel}`))
router.get(`/s/${channel}`, ({ url }) => handler(changeOrigin(url)))
// Context
router.get(`/s/${channel}/:id`, ({ url }) => handler(changeOrigin(url)))

// Load more
router.post(`/s/${channel}`, ({ url }) => fetch(changeOrigin(url), {
  method: 'POST',
  headers: {
    'x-requested-with': 'XMLHttpRequest',
  },
})
  .then(response => response.json())
  .then(processHTML))

// Post
router.get(`/${channel}/:id`, ({ url }) => handler(changeOrigin(url)))

// Custom Emoji
router.get('/i/emoji/:id', ({ url }) => fetch(changeOrigin(url)).then(response => response.json()).then(
  ({ emoji, thumb, ...data }: {
    type: string
    emoji: string
    thumb: string
    path: string
    size: number
  }) => ({
    ...data,
    emoji: `https://wsrv.nl/?url=${emoji}`,
    thumb: `https://wsrv.nl/?url=${thumb}`,
  }),
))

export default createServerAdapter(router.fetch)
