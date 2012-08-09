sys     = require('system')

var server, service;

server = require('webserver').create();

function getParameterByName(name, url) {
  name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
  var regexS = "[\\?&]" + name + "=([^&#]*)";
  var regex = new RegExp(regexS);
  var results = regex.exec("?" + url.split("?")[1]);

  if(results == null)
    return "";
  else
    return decodeURIComponent(results[1].replace(/\+/g, " "));
}

service = server.listen(sys.args[1], function (request, response) {

    var page = require('webpage').create();
    
    var page_url = getParameterByName('url', request.url);
    var callback_func = getParameterByName('callback', request.url);
    
    if ( page_url != null && page_url != "" ) {

      page.open(page_url, function (status) {

        page.injectJs("add.js");

        var itemData = page.evaluate(function () {
            return window.itemData;
        });  

        response.statusCode = 200;

        var out_itemData = {};

        out_itemData.title = itemData.title;
        if ( itemData.price != null && itemData.price.length > 1 ) {
          out_itemData.price = parseFloat(itemData.price.slice(1).replace(/,/g, '')); // remove $
        }
        out_itemData.images = [];
        for ( var i in itemData.imageArray ) {
          console.log(JSON.stringify(itemData.imageArray[i]));
          out_itemData.images.push(itemData.imageArray[i].src);
        }

        console.log(JSON.stringify(itemData));
        output_json = JSON.stringify(out_itemData);
        
        if ( callback_func != null && callback_func != "" ) {
          output_json = callback_func + "(" + output_json + ");"
        }

        response.write(output_json);
        response.close();
        
        //page.release();

      });

    }
    else
    {

      response.statusCode = 500;
      response.write("No URL Provided");
      response.close();

    }

});
