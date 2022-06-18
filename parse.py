from re import I
import requests
import json
import psycopg2
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

def options(extra, id, foodid, mainname, maincost):
    pos = -1
    name = ""
    cost = ""
    for i in range(len(extra)):
        if extra[i] == '(' and extra[i + 1] == '+':
            pos = i + 1
            for curpos in range(pos + 1, len(extra) - 2):
                cost += extra[curpos]
            break
        if pos == -1:
            name += extra[i]
    name.strip()
    name.replace(" ", "")
    name = " ".join(name.split())
    newname = mainname + ' ' + "\[+" + name + ']'
    foodid[id].append(newname)
    if cost == "":
        cost = 0
    else:
        cost = float(cost)
    foodid[id].append(cost + maincost)
    return


foodid = {}

def genid(foodid, allfood):
    firstmark = 1
    for category in allfood:
        secondmark = 1
        for item in range(len(allfood[category])):
            id = str(firstmark) + '.' + str(secondmark)
            foodid[id] = []
            s = allfood[category][item][0]
            s.strip()
            s.replace(" ", "")
            s = " ".join(s.split())
            foodid[id].append(s)
            s = allfood[category][item][1]
            res = ""
            for i in range(0, len(s) - 1):
                res += s[i]
            foodid[id].append(float(res))
            if len(allfood[category][item]) == 4:
                thirdmark= 1
                for extra in range(len(allfood[category][item][3])):
                    id = str(firstmark) + '.' + str(secondmark) + '.' + str(thirdmark)
                    foodid[id] = []
                    ext = allfood[category][item][3][extra]
                    ext.strip()
                    ext.replace(" ", "")
                    ext = " ".join(ext.split())
                    mainname = allfood[category][item][0]
                    mainname.strip()
                    mainname.replace(" ", "")
                    mainname = " ".join(mainname.split())
                    options(ext, id, foodid, mainname, float(res))
                    thirdmark = thirdmark + 1
            secondmark = secondmark + 1
        firstmark = firstmark + 1

genid(foodid, allfood)

con = psycopg2.connect(
    database = "tg-bot-dataBase", 
    user = "postgres", 
    password = "12-sss-qLL-w", 
    host = "localhost", 
    port = "5432"
)
print("Database opened successfully")
cur = con.cursor()

cur.execute("select * from menu_table")   
fetched_menu = cur.fetchall()

fetchedID = []
parsedID = []

for row in fetched_menu:
    fetchedID.append(row[0])

for position in foodid:
    parsedID.append(str(position))

for id in fetchedID:
    if id not in parsedID:
        cur.execute("DELETE FROM menu_table WHERE id = %s", (id, ))
        
for id in parsedID:
    cur.execute("SELECT id FROM menu_table WHERE id = %s", (id, ))
    fetched = cur.fetchone()
    if fetched == None:
        cur.execute("INSERT INTO menu_table (id, name, cost) VALUES (%s, %s, %s)", (id, foodid[id][0], foodid[id][1]))
    
con.commit()  
print("Records inserted successfully") 
con.close()