async function testHTMLRewriter() {
  const html = '<a href="/news/123">Title 1</a><a href="/news/456">Title 2</a>';
  const links: string[] = [];
  
  const rewriter = new HTMLRewriter().on('a[href*="/news/"]', {
    element(element) {
      links.push(element.getAttribute('href') || '');
    }
  });

  await rewriter.transform(new Response(html)).text();
  console.log('Links:', links);
}

testHTMLRewriter();
