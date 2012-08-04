
var maxRequestLength = 4096;

var drag;
var offset = {X : 0, Y : 0};


var floater;
var content;
var listLink;
var descriptionArray = new Array();
var amazonPrice = null;
var asin;
var successSpan;
var failSpan;
var contentForm;
var submitForm;
var displayPromoLink;
var bkPageVersion;
var regselect;



var pageArgs;




    

function isVendor() {
  return 0;
};
  
function isBKMSourceDomain() {


  var isSourceDomain;

    isSourceDomain = document.domain.match(/^(?:www\.)?amazon.com/) || document.domain.match(/www.amazon.com/);
    return isSourceDomain;
  };

function isBKMLocalDomain() {

  var isLocalDomain;

    isLocalDomain = document.domain.match(/^(?:www\.|.*\.)?amazon.com/) || document.domain.match(/www.amazon.com/);
    return isLocalDomain;
  };














var PageScraper = function() {
  this.itemData = {};

  this.itemData = this.getVendorItemData();
  if(!this.itemData) {
    this.itemData = this.getGenericItemData();
  }
};

PageScraper.prototype.getVendorItemData = function() {
      var data = null;
      var isAmazon = isBKMSourceDomain();
      if (isAmazon && !isVendor()) {
        data = this.parseAmazonVendorData();
      }
      else {
          this.bkPageVersion = document.getElementById('AUWLBkPageVersion');
          if (this.itemData && this.bkPageVersion && this.itemData.version == parseInt(this.bkPageVersion.innerHTML)) {
            data = this.itemData;
          }

          if (!data) {
              data = this.parseGenericVendorData();
          }

          if(!data) {
              data = this.parseGoogleCheckoutVendorData();
          }

          if(!data && isAmazon && isVendor()) {
              data = this.parseAmazonVendorData();
          }
      }

      return data;
};

PageScraper.prototype.getGenericItemData = function(){
  var itemData = {"unverified" : true};
  itemData.title = this.getTitle();
  itemData.price = this.getPrice();
  itemData.imageArray = this.getGenericImageData();
  return itemData;
};

PageScraper.prototype.getPrice = function() {
    var startTime = new Date().getTime();
    var nodes = [];
    var nonZeroRe = /[1-9]/;
    var priceFormatRe = /((?:\$|USD|\&pound\;|\&\#163\;|\&\#xa3\;|\u00A3|\&yen\;|\uFFE5|\&\#165\;|\&\#xa5\;|\u00A5|eur|\&\#8364\;|\&\#x20ac\;)\s*\d[0-9\,\.]*)/gi;
    var textNodeRe = /textnode/i;
    var emRe = /em/;
    var priceRangeRe = /^(\s|to|\d|\.|\$|\-|,)+$/; 
    var priceBonusRe = /club|total|price|sale|now|brightred/i;
    var outOfStockRe = /soldout|currentlyunavailable|outofstock/i;
    var tagRe = /^(h1|h2|h3|b|strong|sale)$/i;
    var anchorTagRe = /^a$/i;

    var penRe = /original|header|items|under|cart|more|nav|upsell/i;
    
    var last = "";
    var lastNode;
    var outOfStockIndex = -1;
    var foundPositivePriceBeforeOOSMsg = 0;

    var performOutOfStockCheck = function(domainStr) {
       var blacklist = new Array("toysrus.com", "babiesrus.com", "walmart.com");

       for (var i = 0; i < blacklist.length; i++) {
         var regex = new RegExp("^(?:www\.)?" + blacklist[i], "i");
         if (regex.test(domainStr)) {
           return false;
         } 
       }

       return true;
    };

    var getParents = function(node) {
        var parents = [];
        var traverse = node;
        while(traverse.parentNode) {
        parents.push(traverse.parentNode);
        traverse = traverse.parentNode;
        }
        return parents;
    };
    
    var findMutualParent = function(first,second) {

        var firstParents = getParents(first);
        var secondParents = getParents(second);

        for(var i = 0; i < firstParents.length; i++) {
        for(var j = 0; j < secondParents.length; j++) {
            if(firstParents[i] === secondParents[j]) {
                return firstParents[i];
                }
            }
        }
        return undefined;
    };
    
    var getStyleFunc = function(node) {
        if(document.defaultView && document.defaultView.getComputedStyle) {
            var computedStyle = document.defaultView.getComputedStyle(node,null);
            return function(propertyName) {
                return computedStyle.getPropertyValue(propertyName);
                };
        } else {
            return function(propertyName) {

                var mapper = {
                    "font-size" : "fontSize",
                    "font-weight" : "fontWeight",
		    "text-decoration" : "textDecoration"
                };
                
                return node.currentStyle[ mapper[propertyName] ? mapper[propertyName] : propertyName ];
                };
        }
    };
    
    
    var getWalker = function() {
        if(document.createTreeWalker) {
        return document.createTreeWalker(document.body,
                                       NodeFilter.SHOW_TEXT,
                                       function(node) {
                                           return NodeFilter.FILTER_ACCEPT;
                                       },
                                       false
                                      );
    
        } else {


        return {
            q : [],
            intialized : 0,
            currentNode : undefined,
            nextNode : function() {
                if(!this.initialized) {
                    this.q.push(document.body);
                    this.initialized = true;
                }
                
                while(this.q.length) {
                    var working = this.q.pop();
                    if(working.nodeType == 3) {
                        this.currentNode = working;
                        return true;
                    } else if(working.childNodes) {


                        if(working.style && 
                           (working.style.visibility == "hidden" || 
                            working.style.display == "none")) {
                            continue;
                        }

                        var children = new Array(working.childNodes.length);
                        for(var i = 0; i < working.childNodes.length; i++) {
                            children[i] = working.childNodes[i];
                        }
                        children.reverse();
                        this.q = this.q.concat(children);
                    }
                }
                return false;
            }
        };
        }
    };

    var getFontSizePx = function(styleFunc) {

        var fontSize = styleFunc("font-size") || "";
        var sizeFactor = emRe.test(fontSize) ? 16 : 1;

        fontSize = fontSize.replace(/px|em|pt/,"");
        fontSize -= 0;

        if(!isNaN(fontSize)) {
            return fontSize * sizeFactor;
        } else {
            return 0;
        }
    };

    var getOffset = function(node) {

	var offset = node.offsetTop;

	while(node.offsetParent) {
	    node = node.offsetParent;
	    offset += node.offsetTop;
	}

	return offset;
    };

    var getScore = function(node, index) {

        var domNode = node.node;
        var styledNode = domNode.nodeType == 3 ? domNode.parentNode : domNode;

        var price = node.price;
        var content = "";

        if(domNode.nodeType == 3) {
            content = domNode.data;
        } else {
            content = domNode.innerText || domNode.textContent;
        }
    
        var score = 0;
        var getStyle = getStyleFunc(styledNode);
	
	var fontWeight = getStyle("font-weight");

        if(getStyle("font-weight") == "bold") {
            score += 1;
        } 

       if(!styledNode.offsetWidth && !styledNode.offsetHeight ||
           getStyle("visibility") == "hidden" ||
           getStyle("display") == "none") {
                           score -= 100;
        }

        var parentsChildrenContent = (domNode.parentNode.innerText || domNode.parentNode.textContent).replace(/\s/g,"");
	var strippedContent = content.replace(/\s+/g,"");
	


            if(!nonZeroRe.test(price)) {
                score -= 100;
            }

	var strippedContentNoPrice = strippedContent.replace(/price|our/ig,"");
        if(strippedContentNoPrice.length < price.length * 2 + 4) {
	    score += 10;
	}

	if(priceRangeRe.test(strippedContent)) {
	    score += 2;
	}

	if(price.indexOf(".") != -1) {
	    score += 2;
	}

	score -= Math.abs(getOffset(styledNode) / 500);

        score += getFontSizePx(getStyle);
       
        if (penRe.test(content)) { score-=4; }
        if (priceBonusRe.test(content)) { score++; }
        domNode = styledNode;

        var parentsWalked = 0;

        while (domNode !== null &&
	       domNode != document.body &&
               parentsWalked++ < 4 ) {


	    if(parentsWalked !== 0) {
		getStyle = getStyleFunc(domNode);
	    }

            if(getStyle("text-decoration") == "line-through") {
		 score -=100;
            }



            for(var i = 0; i < domNode.childNodes.length; i++) {

                if(domNode.childNodes[i].nodeType == 3) {
                    
                    var tnode = domNode.childNodes[i];
                    
                    if(tnode.data) {
                        if(priceBonusRe.test(tnode.data)) {
                            score += 1;
                        }
                        
                        if(penRe.test(tnode.data)) {
                            score -= 1;
                        }
                    }
                }
            }

	    if(anchorTagRe.test(domNode.tagName)) {
		score -=5 ;
	    }
            if (priceBonusRe.test(domNode.getAttribute('class') || 
                                  domNode.getAttribute('className'))) {
                score+=1;
            }

            if (priceBonusRe.test(domNode.id)) {
                score+=1;
            }

            if (tagRe.test(domNode.tagName)) {
                score += 1;
            }

            if (penRe.test(domNode.tagName)) {
                score -= 1;
            }

            if (penRe.test(domNode.id)) {
                score -= 2;
            }
            
            if (penRe.test(domNode.getAttribute('class') ||
                           domNode.getAttribute('className'))) {
                score -= 2;
            }

            domNode = domNode.parentNode;

        }
        
	
        score -= content.length / 100;

        score -= index / 5;

        return score;

    };

    walker = getWalker();


    while(walker.nextNode() && nodes.length < 100) {

        if( nodes.length % 100 === 0 ) {
            if( new Date().getTime() - startTime > 1500 ) {
                return;
            }
        }

        var node = walker.currentNode;
    
        var text = node.data.replace(/\s/g,"");
        priceFormatRe.lastIndex = 0;
        var priceMatch = text.match(priceFormatRe);
        
        //If OutofStockIndex has not been set and we found a OOS string then
        // we set the index to number of price matches found before this match
        if((outOfStockIndex < 0) && outOfStockRe.test(text) && performOutOfStockCheck(document.domain)) {
             outOfStockIndex = nodes.length;
        }	
        if(priceMatch) {

           if (priceMatch[0].match(/\.$/g) && walker.nextNode()) {
             var nextNode = walker.currentNode;
             if (nextNode && nextNode.data) {
               var nextPrice = nextNode.data.replace(/\s/g,"");
               if (nextPrice && isNaN(nextPrice)) {
                 nextPrice = "00";
               }
               priceMatch[0] += nextPrice;
             }
           } else if (priceMatch[0].match(/\,$/g)) {
             priceMatch[0] = priceMatch[0].substring(0, priceMatch[0].length - 1);
           }
          
           nodes.push(
             {
                "node" : node,
                "price" : priceMatch[0]
             }
           );
           text = "";
        } else if( last !== "" && text !== "") {
           priceMatch = (last + text).match(priceFormatRe);
           if(priceMatch) {
             var mutual = findMutualParent(lastNode,node);
             nodes.push({"node" : mutual, "price" : priceMatch[0]});
           }
        }
    
        lastNode = node;
        last = text;
    }


    var max = undefined;
    var maxNode = undefined;

    for(var i = 0; i < nodes.length; i++) {
        var score = getScore(nodes[i], i);
        //Trying to see if we found a positive price before we found a OOS match
        if((i < outOfStockIndex) && (score > 0)) {
           foundPositivePriceBeforeOOSMsg = 1;
         }
        if(max === undefined || score > max) {
         max = score;
         maxNode = nodes[i];
        }
    }

    if(maxNode && ((outOfStockIndex < 0) || foundPositivePriceBeforeOOSMsg)) {
     return maxNode.price;
    }
}
;

PageScraper.prototype.sortImage = function(a, b){
	return (b.height*b.width) - (a.height*a.width);
}

PageScraper.prototype.getGenericImageData = function(includeSrc) {
      var imgs = document.getElementsByTagName('img');
      var imageArray = [];
      for (var i=0;i<imgs.length;i++) {
        if (imgs[i].src.length > maxRequestLength) {
           continue;
        }
        var pixelCount = imgs[i].height * imgs[i].width;
        var squareness = 1;
        if (imgs[i].id && imgs[i].id == '__uwl_img_copy__'){
           continue;
        }
        if (imgs[i].id && imgs[i].id == 'uwl_logo'){
           continue;
        }
        
        if (imgs[i].height > imgs[i].width && imgs[i].height > 0) {
          squareness = imgs[i].width / imgs[i].height;
        } else if (imgs[i].width > imgs[i].height && imgs[i].width > 0) {
          squareness = imgs[i].height / imgs[i].width;
        }

        if (pixelCount > 1000 && squareness > 0.5 
            || (includeSrc && imgs[i].src == includeSrc)) {
          var imageIndex = imageArray.length;
          imageArray[imageIndex] = {};
          imageArray[imageIndex].src = imgs[i].src;
          imageArray[imageIndex].height = imgs[i].height;
          imageArray[imageIndex].width = imgs[i].width;
        }
      }
      
      var sortFunc= function(a,b) {
          if (includeSrc) {
             if (a.src == includeSrc && b.src != includeSrc) {
                return -1;
             }
             if (a.src != includeSrc && b.src == includeSrc) {
                return 1;
             }
          }
          return PageScraper.prototype.sortImage(a, b);
      };
      imageArray.sort(sortFunc);
      return imageArray;
};

PageScraper.prototype.getElementsByClassName = function(className, elem) {
      elem = elem || document;
      var matches = [];
      if (document.getElementsByClassName) {
        try {
          var elems = elem.getElementsByClassName(className);
          for(var i = 0; i < elems.length; i++) {
            matches.push(elems[i]);
          }
        }
        catch (err) {
            matches = this.getElementsByClassNameFallback(className, elem);           
        }
        return matches;
      }
      else if(document.evaluate) {
        var node;
        var elems = document.evaluate(".//*[contains(concat(' ', @class, ' '),' " + className + " ')]",
                       elem, null, 0, null);
        while (node = elems.iterateNext()) {
          matches.push(node);
        }
        return matches;
      }
      else {
        matches = this.getElementsByClassNameFallback(className, elem);
        return matches;
      }
};

PageScraper.prototype.getElementsByClassNameFallback = function(className, elem) {
      var matches = [],
          elems = elem.getElementsByTagName("*"),
          regex = new RegExp("(^|\\s)" + className + "(\\s|$)");

       for(var i = 0; i < elems.length; i++) {
          if(regex.test(elems[i].className)) {
            matches.push(elems[i]);
          }
        }

      return matches;
};


PageScraper.prototype.extractValue = function(elem) {
      if (elem.nodeName == "IMG" || elem.nodeName == "IFRAME") {
        return elem.src;
      } else if (elem.nodeName == "INPUT") {
        return elem.value;
      }
      return elem.innerHTML;
};

PageScraper.prototype.parseGenericVendorData = function() {
      var postfix = '';
      if (pageArgs && pageArgs.name) {
        postfix = '.' + pageArgs.name;
      }

      var _object = null;
      var obj = function () {
          if (_object){ return _object;}
          _object = new Object();
          return _object;
      }

      var bkHide = document.getElementById('AUWLBkHide' + postfix);
      if (bkHide && bkHide.innerHTML && bkHide.innerHTML.length && isBKMLocalDomain()) {
          obj().hide = bkHide.innerHTML;
      }
      var bkTitle = document.getElementById('AUWLBkTitle' + postfix);
      if (bkTitle){
          obj().title = bkTitle.innerHTML;
      }
      var bkPrice = document.getElementById('AUWLBkPrice' + postfix);
      var bkPriceLow = document.getElementById('AUWLBkPriceLow' + postfix);
      var bkPriceHigh = document.getElementById('AUWLBkPriceHigh' + postfix);
      var bkCurrency = document.getElementById('AUWLBkCurrency' + postfix);
      if (bkPrice && bkPrice.innerHTML && bkPrice.innerHTML.length){
          obj().price = bkPrice.innerHTML;
      } else if (bkPriceLow && bkPriceLow.innerHTML && bkPriceLow.innerHTML.length
              && bkPriceHigh && bkPriceHigh.innerHTML && bkPriceHigh.innerHTML.length) {
          obj().price = bkPriceLow.innerHTML;
      }
      if (bkCurrency && bkCurrency.innerHTML && bkCurrency.innerHTML.length) {
        obj().currency = bkCurrency.innerHTML;
      }
      var bkImage = document.getElementById('AUWLBkImage' + postfix);
      if (bkImage){
        obj().imageArray = [ {
          "src" : bkImage.innerHTML
        }];
      }
      var bkURL = document.getElementById('AUWLBkURL' + postfix);
      if (bkURL){
          obj().url = bkURL.innerHTML;
      }

      if (bkPageVersion) {
        var version = parseInt(bkPageVersion.innerHTML);
        obj().version = version;
      }

      var bkBannerImage = document.getElementById('AUWLBkBannerImage' + postfix);
      var isAmazon = isBKMSourceDomain();
      if(bkBannerImage && isAmazon) {
        obj().bannerImage = bkBannerImage.innerHTML;
      }

      return _object;
};

PageScraper.prototype.parseAmazonVendorData = function() {

      var itemData = new Object();

      try {
        itemData.title = document.title;
        if(typeof itemData.title != "string") {
          itemData.title = "";
        }
        try {
          var titleBlock = document.getElementById('btAsinTitle');
          if (titleBlock) {
            itemData.title = titleBlock.innerText || titleBlock.textContent;
            if (itemData.title) {
              itemData.title = itemData.title.replace(/^\s+|\s+$/g, "");
            }
          }
        } catch(e) {}
        try {
          itemData.asin = document.handleBuy.ASIN.value;
        } catch (e) {
          try {
            var asinFieldNames = {ASIN: 1, asin: 1, o_asin: 1};
            asinFieldNames['ASIN.0'] = 1;
            for (var asinField in asinFieldNames) {
              var asins = document.getElementsByName(asinField);
              if (asins.length) {
                itemData.asin = asins[0].value;
                break;
              }
            }
          } catch (e) {}
        }
        var checkTags = new Array("b", "span"); 
        if (document.evaluate) {
          for (var i=0; i < checkTags.length; i++) {
            var elts = document.evaluate("//div[@id='priceBlock']//table[@class='product']//td//" + checkTags[i] + "[contains(@class,'priceLarge') or contains(@class,'price') or contains(@class,'pa_price')]",
                         document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
            var elt = null;
            while (elt = elts.iterateNext()) {
              if (elt.textContent) {
                itemData.price = elt.textContent;
                break;
              }
            }
            if (itemData.price) break;
          }
        } else {
          var priceBlock = document.getElementById('priceBlock');
          if (priceBlock) {
            var tables = priceBlock.getElementsByTagName('table');
            for (var i=0; i < tables.length; i++) {
              var tableClass = tables[i].getAttribute('class') || tables[i].getAttribute('className');
              if (tableClass == 'product') {
                for (var j=0; i < checkTags.length; j++) {
                  var elements = tables[i].getElementsByTagName(checkTags[j]);
                  for (var i = 0; i < elements.length; i++) {
                    var elementClass = elements[i].getAttribute('class') || elements[i].getAttribute('className');
                    if (elementClass.indexOf('price') > -1 || elementClass.indexOf('priceLarge') > -1 || elementClass.indexOf('pa_price') > -1) {
                      itemData.price = elements[i].innerHTML;
                      break;
                    }
                  }
                  if (itemData.price) break;
                }
              }
            }
          }
        }

        if (itemData && itemData.price) {
          var priceParts = itemData.price.split("-");
          if(priceParts[0]){
            itemData.price = priceParts[0];
          }
        } 

        var imageCellNames = {prodImageCell: 1, fiona_intro_noflash: 1, productheader: 1, 'kib-ma-container-1': 1, 'center-12_feature_div': 1, holderMainImage: 1};
        var selectedImage;
        
        for (var imageCell in imageCellNames) {
          var prodImageCell = document.getElementById(imageCell);
          if (prodImageCell) {
            var prodImages = prodImageCell.getElementsByTagName('img');
            if(prodImages.length){
            	var prodImageArray = new Array(prodImages.length);
                for (var i = 0; i < prodImages.length; i++){
            	    prodImageArray.push(prodImages[i]);
                }
                prodImageArray.sort(this.sortImage);
                selectedImage = prodImageArray[0];
	            break;
            }
          }
        }
        
        if (selectedImage) {
          itemData.imageArray = [{
            "src" : selectedImage.src
          }];
        } else {
          if ( itemData && !itemData.asin) {
            itemData.imageArray = this.getGenericImageData();
          }
        }
      } catch(e) {}

      if(!itemData.imageArray) {
         itemData.imageArray = [];
      }
      return itemData;
};
PageScraper.prototype.parseGoogleCheckoutVendorData = function() {

      var itemData = null;

    var elems = this.getElementsByClassName("product");

      if (elems && elems[0]) {
        itemData = {};
        itemData.unverified = true;
        var prod = elems[0];
        var scrapedImage;

        var titleElem = this.getElementsByClassName("product-title", prod);
        if(titleElem && titleElem[0]) {
          itemData.title = this.extractValue(titleElem[0]);
        }
        var priceElem = this.getElementsByClassName("product-price", prod);
        if(priceElem && priceElem[0]) {
          itemData.price = this.extractValue(priceElem[0]);
        }
        var urlElem = this.getElementsByClassName("product-url", prod);
        if(urlElem && urlElem[0]) {
          itemData.url = this.extractValue(urlElem[0]);
        }
        var imgElem = this.getElementsByClassName("product-image", prod);
        if (imgElem && imgElem[0]) {
          var imgSrc = this.extractValue(imgElem[0]);
          scrapedImage = imgSrc;
        }

        itemData.imageArray = this.getGenericImageData(scrapedImage);
      }

      if(itemData && itemData.title && itemData.price) {
          return itemData;
      } else {
          return null;
      }
};

PageScraper.prototype.getTitle = function() {
  var title = window.document.title;
  if(typeof title != "string") {
    return "";
  }
    
  title = title.replace(/\s+/g,' ');
  title = title.replace(/^\s*|\s*$/g,'');
  
  if(document.domain.match(/amazon\.com/) && asin){
    var titleParts = title.split(":");
    if(titleParts[1]){
      title = titleParts[1];
    }
  }
  return title;
};

window.itemData = new PageScraper().itemData;
