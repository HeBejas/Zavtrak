// 5319818931:AAHPEeBbK73oZyss95EdOScfQa0oV-tJamY
let {PythonShell} = require('python-shell')

const TelegramApi = require('node-telegram-bot-api')
const token = '5319818931:AAHPEeBbK73oZyss95EdOScfQa0oV-tJamY'
const bot = new TelegramApi(token, {polling: true})

const fs = require('fs');
const parsed = fs.readFileSync('parsed.json')

// меню по категориям
const food = JSON.parse(parsed)

// меню по позициям
const foodId = {}

// данные пользователей
const usersData = {}

// парсинг опций (название, цена)
function getExtra(extra, id, foodId, mainName, mainCost) {
    let pos = -1, name = "", cost = ""
    for(let i = 0; i < extra.length; ++i) {
        if(extra[i] == '(' && extra[i + 1] == '+') {
            pos = i
            for(let curpos = pos + 1; curpos < extra.length; ++curpos) {
                cost += extra[curpos]
            }
            break
        }
        if(pos == -1)
            name += extra[i]
    }
    foodId[id].push(mainName + " " + "[+" + name.replace(/\s+/g, ' ').trim() + "]")
    if(cost == "")
        cost = 0
    else 
        cost = parseFloat(cost)
    foodId[id].push(cost + mainCost)
    return
}

// генерация номеров позиций
function generateId(food, foodId) {
    let firstmark = 1
    for(category in food) {
        let secondmark = 1
        for(let item = 0; item < food[category].length; ++item) {
            id = firstmark.toString() + "." + secondmark.toString()
            foodId[id] = []
            foodId[id].push(food[category][item][0].replace(/\s+/g, ' ').trim())
            foodId[id].push(parseFloat(food[category][item][1]))
            if(food[category][item].length == 4) {
                let thirdmark = 1
                for(let extra = 0; extra < food[category][item][3].length; ++extra) {
                    id = firstmark.toString() + "." + secondmark.toString() + "." + thirdmark.toString()
                    cur = []
                    foodId[id] = []
                    getExtra(food[category][item][3][extra].replace(/\s+/g, ' ').trim(), id, foodId, food[category][item][0], parseFloat(food[category][item][1]))
                    thirdmark++
                }
            }
            secondmark++
        }
        firstmark++
    }
}

// запуск генерации номеров позиций
generateId(food, foodId)

// запуск бота
const runBot = () => {

    // список команд
    let commands = []

    // команды
    bot.setMyCommands(commands = [
        {command: '/commands', description: 'информация о доступных командах'},
        {command: '/info', description: 'информация о доставке'},
        {command: '/menu', description: 'показать меню'},
        {command: '/add', description: 'добавить позицию в корзину'}, 
        {command: '/delete', description: 'удалить позицию из корзины'},
        {command: '/cart', description: 'корзина'},
        {command: '/cartclear', description: 'полностью очистить корзину'},
        {command: '/order', description: 'оформить заказ'},
    ])

    // обработка сообщений пользователя
    bot.on('message', async msg => {
        const chatId = msg.chat.id
        const text = msg.text
        const userId = msg.from.id.toString()

        // обработка превышения допустимого размера сообщения
        if(text.length >= 500) {
            return bot.sendMessage(chatId, "Сообщение слишком большое")
        }

        // регистрация пользователя
        if(!(userId in usersData)) {
            usersData[userId] = {}
            usersData[userId]["isStarted"] = true
            usersData[userId]["cart"] = {}
            usersData[userId]["cost"] = 0
            usersData[userId]["number"] = {}

            let firstcounter = 1
            for(category in food) {
                let secondcounter = 1
                for(item in food[category]) {
                    if(food[category][item].length == 3) {
                        usersData[userId]["number"][(firstcounter.toString() + "." + secondcounter.toString())] = 0
                    }
                    else if(food[category][item].length == 4) {
                        let thirdcounter = 1
                        for(let extra = 0; extra < food[category][item][3].length; ++extra) {
                            usersData[userId]["number"][(firstcounter.toString() + "." + secondcounter.toString() + "." + thirdcounter.toString())] = 0
                            ++thirdcounter
                        }
                    }
                    ++secondcounter
                }
                ++firstcounter
            }
        }

        console.log(userId)

        // проверка на попытку добавления позиции в корзину
        let isOrder = false
        let potentialAdd = ""
        let orderPosition = 0

        for(let i = 0; i < text.length; ++i) {
            potentialAdd += text[i]
            if(potentialAdd == "/add") {
                isOrder = true 
                orderPosition = i + 1
                break
            }
        }

        // проверка на попытку удаления позиции из корзины
        let isDelete = false
        let potentialDelete = ""
        let deletePosition = 0

        for(let i = 0; i < text.length; ++i) {
            potentialDelete += text[i]
            if(potentialDelete == "/delete") {
                isDelete = true
                deletePosition = i + 1
                break
            }
        }

        // запуск бота
        if(text == '/start') {
            await bot.sendMessage(chatId, `Привет, ${msg.from.first_name}!`)
            return bot.sendMessage(chatId, "Для ознакомления с меню пропиши /menu")
        }

        // дополнительная информация о доставке
        if(text == '/info') {
            let currentText = ""
            currentText += '*Информация о доставке*' + "\n\n"
            currentText += 'До *11* часов прием заказов на текущий день.' + "\n\n"
            currentText += 'После *12* часов заказы принимаются на следующий день.' + "\n\n"
            currentText += 'С *12* до *14* часов доступно полное меню для заказа.' + "\n\n"
            currentText += 'После *14* остается только сокращенное меню.' + "\n\n"
            currentText += 'Наш сайт - *доставка18.рф*' + "\n\n"
            return bot.sendMessage(chatId, currentText, {parse_mode: 'Markdown'})
        }

        // меню
        if(text == '/menu') {
            let firstmark = 1

            // вывод категории
            for(category in food) {
                let current = (`*${firstmark} ${category}*` + "\n\n")
                let secondmark = 1

                // вывод элементов категории
                for(let item = 0; item < food[category].length; ++item) {
                    if(food[category][item].length == 3)
                        current += `${firstmark}.${secondmark}` + " " + food[category][item][0].replace(/\s+/g, ' ').trim() + " (" + food[category][item][1].replace(/\s+/g, ' ').trim() + ")" + " " + `/add${firstmark}d${secondmark}` + "\n\n"
                    else if(food[category][item].length == 4)
                        current += `${firstmark}.${secondmark}` + " " + food[category][item][0].replace(/\s+/g, ' ').trim() + " (" + food[category][item][1].replace(/\s+/g, ' ').trim() + ")" + "\n\n"

                    // вывод опций элементов категории
                    if(food[category][item].length == 4) {
                        let thirdmark = 1
                        for(let extra = 0; extra < food[category][item][3].length; ++extra) {
                            current += `${firstmark}.${secondmark}.${thirdmark}` + " " + food[category][item][3][extra].replace(/\s+/g, ' ').trim() + " " + `/add${firstmark}d${secondmark}d${thirdmark}` + "\n\n"
                            ++thirdmark
                        }
                    }
                    ++secondmark
                }
                ++firstmark
                await bot.sendMessage(chatId, current, {parse_mode: 'Markdown'})
            }
            return
        }

        // добавление позиции в козрину
        if(isOrder) {
            let orderId = ""

            for(let i = orderPosition; i < text.length; ++i) {
                if(text[i] == 'd')
                    orderId += '.'
                else 
                    orderId += text[i]
            }

            if(orderId == "")
                return bot.sendMessage(chatId, "Чтобы добавить позицию в корзину, введите номер позиции из меню после команды /add")

            const orders = orderId.split(",");

            for(current in orders) 
                orders[current] = orders[current].trim()

            let currentText = ""

            for(current in orders) {
                let dotCounter = 0
                let mainCurrent = ""

                for(let i = 0; i < orders[current].length; ++i) {
                    if(orders[current][i] == '.')
                        ++dotCounter
                    if(dotCounter < 2)
                        mainCurrent += orders[current][i]
                }

                if(dotCounter == 2) {
                    if(mainCurrent in foodId) {
                        if(orders[current] in foodId) {
                            usersData[userId]["cart"][orders[current]] = foodId[orders[current]]
                            usersData[userId]["cost"] += foodId[orders[current]][1]
                            ++usersData[userId]["number"][orders[current]]
                            currentText += "*" + foodId[orders[current]][0] + "* добавлено в корзину" + "\n\n"
                        }
                        else
                            currentText += "Опции с номером *" + orders[current] + "* не существует" + "\n\n"
                    }
                }
                else {
                    if(orders[current] in usersData[userId]["number"]) {
                        usersData[userId]["cart"][orders[current]] = foodId[orders[current]]
                        usersData[userId]["cost"] += foodId[orders[current]][1]
                        ++usersData[userId]["number"][orders[current]]
                        currentText += "Позиция *" + orders[current] + "* добавлена в корзину" + "\n\n"
                    }
                    else {
                        if(orders[current] in foodId)
                            currentText += "Позицию *" + orders[current] + "* нельзя выбрать без опции" + "\n\n"
                        else 
                            currentText += "Позции *" + orders[current] + "* не существует" + "\n\n"
                    }
                }
            }
            return bot.sendMessage(chatId, currentText, {parse_mode: 'Markdown'})
        }

        // удаление позиции из корзины
        if(isDelete) {
            let orderId = ""

            for(let i = deletePosition; i < text.length; ++i) {
                if(text[i] == 'd')
                    orderId += '.'
                else 
                    orderId += text[i]
            }

            if(orderId == "")
                return bot.sendMessage(chatId, "Чтобы удалить позицию из корзины, введите номер позиции из меню после команды /delete")

            const orders = orderId.split(',')

            for(item in orders)
                orders[item] = orders[item].trim()

            let currentText = ""

            // основной алгоритм
            for(current in orders) {
                if(orders[current] in usersData[userId]["cart"]) {
                    if(usersData[userId]["number"][orders[current]] >= 1) {
                        usersData[userId]["cost"] -= foodId[orders[current]][1]
                        --usersData[userId]["number"][orders[current]]
                        if(usersData[userId]["number"][orders[current]] == 0)
                            delete usersData[userId]["cart"][orders[current]]
                    }
                    currentText += "*" + foodId[orders[current]][0] + "*" + " " + "удалено из корзины" + "\n\n"
                }
                else
                    currentText += "Позиции *" + orders[current] + "*" + " " + "нет в корзине" + "\n\n"
            }
            return bot.sendMessage(chatId, currentText, {parse_mode: 'Markdown'})
        }

        // корзина
        if(text == '/cart') {
            let currentText = ""

            for(current in usersData[userId]["cart"]) {
                currentText += usersData[userId]["cart"][current][0] + " (" + usersData[userId]["number"][current] + " " + "шт.)" + " " + "/delete" + (current.replace(".", "d")).replace('.', "d") + "\n\n"
            }
            if(currentText == "") {
                return bot.sendMessage(chatId, "Корзина пуста")
            }
            await bot.sendMessage(chatId, currentText, {parse_mode: ''})
            return bot.sendMessage(chatId, "Стоимость заказа: " + usersData[userId]["cost"] + " " + "рублей")
        }

        // очистка корзины
        if(text == '/cartclear') {
            usersData[userId]["cart"] = {}
            usersData[userId]["cost"] = 0

            for(current in usersData[userId]["number"])
                usersData[userId]["number"][current] = 0

            return bot.sendMessage(chatId, 'Корзина очищена')
        }

        // оформление заказа
        if(text == '/order') {
            let clientName = "*" + msg.from.first_name + "*" + "\n\n"
            let currentText = ""

            for(current in usersData[userId]["cart"]) {
                currentText += usersData[userId]["cart"][current][0] + " (" + usersData[userId]["number"][current] + " " + "шт.)" + "\n\n"
            }

            if(currentText == "")
                return bot.sendMessage(chatId, "Вы не можете оформить пустой заказ")
            else {
                currentText += "Стоимость заказа: " + usersData[userId]["cost"] + " " + "рублей"
                await bot.sendMessage(chatId, "Заказ отправлен менеджеру")
                return bot.sendMessage(5364353649, clientName + currentText, {parse_mode: 'Markdown'})
            }
        }

        // команды
        if(text == '/commands') {
            for(current in commands)
                if(commands[current]["command"] != "/commands")
                    bot.sendMessage(chatId, commands[current]["command"] + " - " + commands[current]["description"])
            return
        }

        return bot.sendMessage(chatId, 'Чтобы посмотреть доступные команды, введите */commands*', {parse_mode: 'Markdown'})
    })

    // обработка нажатий
    bot.on('callback_query', async msg => {
        const data = msg.data
        const chatId = msg.message.chat.id
    })
}

// запуск бота
runBot()