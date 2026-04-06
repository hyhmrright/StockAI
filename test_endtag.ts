async function testEndTag() {
  const html = '<a href="/news/123">Title <b>Bold</b> 1</a>';
  let text = "";
  
  const rewriter = new HTMLRewriter().on('a', {
    element(element) {
      console.log('Start Tag');
      element.onEndTag(tag => {
        console.log('End Tag, final text:', text.trim());
      });
    },
    text(t) {
      text += t.text;
    }
  });

  await rewriter.transform(new Response(html)).text();
}

testEndTag();
