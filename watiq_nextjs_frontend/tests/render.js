import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Render a Server Component to HTML for assertion.
 *
 * An async Server Component is just an async function returning an element
 * tree, so it is awaited first and the result handed to the synchronous
 * renderer. That covers a component whose async work is its own; a nested async
 * child would need the RSC renderer, which needs a bundler — the components
 * under test here take their data as props for exactly that reason, which is
 * also what makes them testable at all.
 *
 * Static markup rather than renderToString: no hydration markers, so an
 * assertion reads against the HTML a browser sees.
 */
export async function render(Component, props = {}) {
  const element = await Component(props);
  return renderToStaticMarkup(element);
}
