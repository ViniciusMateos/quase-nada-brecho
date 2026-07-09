/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'ScrapeWidget',
  deploymentTarget: '16.2',
  // logo branca da marca — vira Assets.xcassets/qnlogo.imageset → Image("qnlogo") no widget.
  // IMPORTANTE: o path PRECISA começar com './' — o plugin só resolve relativo à pasta do
  // target quando começa com '.' ou '/'; sem isso ele procura na raiz, não acha e pula calado.
  images: {
    qnlogo: './logo.png',
  },
};
