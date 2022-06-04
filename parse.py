import requests
import json
from bs4 import BeautifulSoup as bs

URL = "http://xn--18-6kcajk8b3a1ak.xn--p1ai/index.php?route=product/category&path=179"

def get_html(url):
    r = requests.get(url)
    return r

allfood = {}

def get_food(allfood):

    def get_extra(html, categoryname, cur):
        soup = bs(html, 'html.parser')
        special = soup.find("div", class_ = "option")
        if special == None:
            allfood[categoryname].append(cur)
        else:    
            extras = special.find_all("label")
            ext = []
            for extra in extras:
                ext.append(extra.get_text(strip = True))
            cur.append(ext)
            allfood[categoryname].append(cur)
            

    def get_content(html, categoryname):
        soup = bs(html, 'html.parser')
        eda = soup.find("div", id = "content")
        items = eda.find_all("div", class_ = "")
        for item in items:
            cur = []
            cur.append(item.find(class_ = 'name').get_text(strip=True))
            cur.append(item.find(class_ = 'price').get_text(strip=True))
            cur.append(item.find('a').get('href'))
            url2 = item.find('a').get('href')
            html2 = get_html(url2)
            get_extra(html2.text, categoryname, cur)
        
    def get_menu(html):
        soup = bs(html, 'html.parser')
        bluda = soup.find_all("li", class_ = "mega-menu-products")
        for bludo in bluda:
            categoryname = str(bludo.find('span', class_ = 'main-menu-text').get_text(strip=True))
            url1 = bludo.find('a').get('href')
            html1 = get_html(url1)
            allfood[categoryname] = []
            get_content(html1.text, categoryname)

    html = requests.get(URL)
    get_menu(html.text)

get_food(allfood)

with open("parsed.json", "w") as file:
    json.dump(allfood, file)