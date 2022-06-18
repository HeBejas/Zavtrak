// 5319818931:AAHPEeBbK73oZyss95EdOScfQa0oV-tJamY

const TelegramApi = require('node-telegram-bot-api')
const token = '5319818931:AAHPEeBbK73oZyss95EdOScfQa0oV-tJamY'
const bot = new TelegramApi(token, {polling: true})

// модуль запуска подпроцессов
const { exec } = require('child_process')

// запуск парсера при загрузке бота
exec('python -u "parse.py"', (err, stdout, stderr) => {
    if(err)   
        return
    console.log(stdout, stderr)
})

// модуль планировщика
const schedule = require('node-schedule')

// модуль базы данных PostgreSQL
const { Client } = require('pg')

// подключение к базе данных
const dataBase = new Client({
    host: 'localhost',
    user: 'postgres', 
    port: 5432, 
    password: '12-sss-qLL-w',
    database: 'tg-bot-dataBase',
})

dataBase.connect()

//данные пользователей 
let usersData = {}

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
        {command: '/delete', description: 'удалить единицу позиции из корзины'},
        {command: '/cart', description: 'показать содержимое корзины'},
        {command: '/cartclear', description: 'полностью очистить корзину'},
        {command: '/order', description: 'оформить заказ'},
        {command: '/history', description: 'история заказов за неделю'},
        {command: '/orders', description: 'показать список неоформленных заказов'},
        {command: '/confirm', description: 'подтвердить оформление заказов'},
        {command: '/report', description: 'недельный отчёт о стоимости оформленных заказов по каждому пользователю'}
    ])

    // получение данных из таблицы menu_table
    async function generateMenu() {
        let response = dataBase.query('SELECT * FROM menu_table');
        return (await response).rows
    }

    // получение истории заказов из таблицы orders
    async function getHistory(date, userId) {
        let response = dataBase.query(`SELECT order_time, order_list, order_cost, confirmed FROM orders WHERE (user_id = $1 and order_date = $2)`, [userId, date])
        return (await response).rows
    }

    // добавление данных в таблицу orders
    async function insertOrderData(userId, userName, time, today, orderList, cost) {
        dataBase.query(`INSERT INTO orders (user_id, user_name, order_time, order_date, order_list, order_cost, confirmed) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [userId, userName, time, today, orderList, cost, false])
        return
    }

    // получение всех данных из таблицы orders за текущую дату
    async function getOrders(date) {
        let response = dataBase.query(`SELECT user_id, user_name, order_time, order_list, order_cost, confirmed FROM orders WHERE order_date = $1`, [date])
        return (await response).rows
    }

    // подтверждение заказа
    async function confirmOrder(userId, orderTime, orderDate) {
        dataBase.query(`UPDATE orders SET confirmed = $4 WHERE user_id = $1 and order_time = $2 and order_date = $3`, [userId, orderTime, orderDate, true])
        return
    }

    // получение всех user_id 
    async function getUsers() {
        let response = dataBase.query(`SELECT DISTINCT user_id, user_name FROM orders`)
        return (await response).rows
    }

    // меню по позициям
    let foodId = {}

    // структурированное меню
    let food = {"1": {}, "2": {}, "3": {}, "4": {}, "5": {}, "6": {}, "7": {}, "8": {}}

    // запуск парсера по расписанию 
    async function runParser() {
        schedule.scheduleJob('0 9-14 * * *', async function() {
            console.log("Запуск парсера")
            exec('python -u "parse.py"', (err, stdout, stderr) => {
                if(err)   
                    return
                console.log(stdout, stderr)
            })
        })
    }

    runParser()

    // обработка сообщений пользователя
    bot.on('message', async msg => {
        const chatId = msg.chat.id
        const text = msg.text
        const userId = msg.from.id.toString()

        // вывод ID пользователя в консоль для отслеживания действий
        console.log(userId)

        // проверка на валидное сообщение
        if(msg.text == undefined)
            return bot.sendMessage(chatId, "Сообщение не распознано")

        // ограничение на размер сообщения
        if(text.length > 250) 
            return bot.sendMessage(chatId, "Длина сообщения/a превышает допустимые *250* символов", {parse_mode: 'Markdown'})

        // генерация меню по позициям
        let result = (await generateMenu())

        for(row in result)
            foodId[result[row].id] = [result[row].name, result[row].cost]

        // генерация структурированного меню
        for(position in foodId) {
            let dotCounter = 0
            let parentPosition = ""

            for(let i = 0; i < position.length; ++i) {
                if(position[i] == '.')
                    ++dotCounter
                if(dotCounter < 2)
                    parentPosition += position[i]
            }
            
            if(dotCounter == 1) {
                let firstOption = position + '.' + '1'
                if(firstOption in foodId)
                    food[position[0]][position] = [foodId[position][0], foodId[position][1], {}]
                else 
                    food[position[0]][position] = [foodId[position][0], foodId[position][1]]
            }
            else {
                food[position[0]][parentPosition][2][position] = [foodId[position[0]], foodId[position][1]]
            }
        }

        // регистрация сессионных данных пользователя
        if(!(userId in usersData)) {
            usersData[userId] = {}
            usersData[userId]["cart"] = {}
            usersData[userId]["cost"] = 0
            usersData[userId]["number"] = {} 

            for(category in food)
                for(position in food[category])
                    if(food[category][position].length == 2)
                        usersData[userId]["number"][position] = 0
                    else {
                        for(option in food[category][position][2])
                            usersData[userId]["number"][option] = 0
                    }
        }

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
            let categoryName = {"1": "Салаты", "2": "Первые блюда", "3": "Вторые блюда", "4": "Блюда в горшочках", "5": "Выпечка", "6": "Напитки", "7": "Пироги", "8": "Прочее"}

            for(category in food) {

                if(food[category].length == 0)
                    continue

                let current = "*" + category + " " + categoryName[category] + "*" + "\n\n"

                for(position in food[category]) {
                    if(food[category][position].length == 2)
                        current += position + " " + foodId[position][0] + " " + "_\(" + foodId[position][1] + " " + "руб." + "\)_" + " " + "/add" + position.replaceAll(".", "d") + "\n\n"
                    else {
                        current += position + " " + foodId[position][0] + " " + "_\(" + foodId[position][1] + " " + "руб." + "\)_" + "\n\n"
                        for(option in food[category][position][2])
                            current += option + " " + foodId[option][0] + " " + "_\(" + foodId[option][1] + " " + "руб." + "\)_" + " " + "/add" + option.replaceAll(".", "d") + "\n\n"
                    }
                }

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
                    else 
                        currentText += "Позиции с номером *" + orders[current] + "* не существует" + "\n\n"
                }
                else {
                    if(orders[current] in usersData[userId]["number"]) {
                        usersData[userId]["cart"][orders[current]] = foodId[orders[current]]
                        usersData[userId]["cost"] += foodId[orders[current]][1]
                        ++usersData[userId]["number"][orders[current]]
                        currentText += "*" + foodId[orders[current]][0] + "* добавлено в корзину" + "\n\n"
                    }
                    else {
                        if(orders[current] in foodId)
                            currentText += "Позицию *" + orders[current] + "* нельзя выбрать без опции" + "\n\n"
                        else 
                            currentText += "Позции *" + orders[current] + "* не существует" + "\n\n"
                    }
                }
            }
            if(currentText == "")
                return bot.sendMessage(chatId, "Возникла какая-то проблема: возможно, команда введена неверно")

            return bot.sendMessage(chatId, currentText.replaceAll("\\", ""), {parse_mode: 'Markdown'})
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
            return bot.sendMessage(chatId, currentText.replaceAll("\\", ""), {parse_mode: 'Markdown'})
        }

        // корзина
        if(text == '/cart') {
            let currentText = ""

            for(current in usersData[userId]["cart"])
                currentText += usersData[userId]["cart"][current][0] + " " + "*(" + usersData[userId]["number"][current] + " шт." + " × " + foodId[current][1] + "руб." + ")*" + " " + "/delete" + (current.replace(".", "d")).replace('.', "d") + "\n\n"

            if(currentText == "") 
                return bot.sendMessage(chatId, "Корзина пуста")

            await bot.sendMessage(chatId, currentText, {parse_mode: 'Markdown'})
            await bot.sendMessage(chatId, "Стоимость заказа: " + usersData[userId]["cost"] + " " + "рублей", {parse_mode: 'Markdown'})
            return bot.sendMessage(chatId, "Оформить заказ: /order", {parse_mode: 'Markdown'})
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
            let orderList = ""

            for(position in usersData[userId]["cart"])
                orderList += foodId[position][0] + " " + "*(" + usersData[userId]["number"][position] + " шт." + " × " + foodId[position][1] + "руб." + ")*" + "\n\n"

            let userName = msg.from.first_name.toString()
            if(msg.from.last_name != undefined)
                userName += " " + msg.from.last_name.toString()

            let today = new Date()
            let time = today.toLocaleTimeString()
            today = today.toLocaleDateString()

            if(orderList == "")
                return bot.sendMessage(chatId, "Вы не можете оформить пустой заказ")

            await insertOrderData(userId, userName, time, today, orderList, usersData[userId]["cost"])
            await bot.sendMessage(chatId, "Заказ оформлен" + "\n\n")

            usersData[userId]["cart"] = {}
            usersData[userId]["cost"] = 0

            for(position in usersData[userId]["number"])
                usersData[userId]["number"][position] = 0

            return
        }

        // подтверждение оформления заказов
        if(text == '/confirm') {
            let today = new Date()
            today = today.toLocaleDateString()

            let allOrders = {}

            let result = await getOrders(today)

            for(row of result)
                allOrders[row.user_id] = []

            let allCounter = 0
            let confirmedCounter = 0

            for(row of result) {
                allOrders[row.user_id].push([row.user_name, row.order_time, row.order_list, row.order_cost, row.confirmed])
                ++allCounter
                if(row.confirmed)
                    ++confirmedCounter
            }

            if(confirmedCounter == allCounter)
                return bot.sendMessage(chatId, "Все заказы за сегодня уже оформлены")

            await bot.sendMessage(chatId, "*Оформленные заказы*", {parse_mode: 'Markdown'})

            unconfirmedOrders = {}

            for(user in allOrders) {
                unconfirmedOrders[user] = false
                for(userOrder in allOrders[user])
                    if(allOrders[user][userOrder][4] == false) {
                        unconfirmedOrders[user] = true
                        break
                    }
            }

            for(user in allOrders) {
                if(!unconfirmedOrders[user])
                    continue
                let currentText = "Заказы пользователя " + "*" + allOrders[user][0][0] + "*" + "\n\n"
                let k = 1
                for(userOrder in allOrders[user]) {
                    if(allOrders[user][userOrder][4] == false) {
                        currentText += "*" + k.toString() + "*" + "\n\n"
                        currentText += "Время заказа: " + "*" + allOrders[user][userOrder][1] + "*" + "\n\n"
                        currentText += allOrders[user][userOrder][2]
                        currentText += "Стоимость заказа: " + allOrders[user][userOrder][3] + " " + "рублей" + "\n\n"
                        ++k
                    }
                    else 
                        continue
                }
                await bot.sendMessage(chatId, currentText, {parse_mode: 'Markdown'})
            }

            let changeresult = (await getOrders(today))

            for(row of changeresult) {
                if(!row.confirmed) {
                    await confirmOrder(row.user_id, row.order_time, today)
                }
            }

            return
        }

        // посмотреть оформленные заказы
        if(text == '/orders') {
            let today = new Date()
            today = today.toLocaleDateString()

            let allOrders = {}

            let result = await getOrders(today)

            for(row of result) {
                allOrders[row.user_id] = []
            }

            let allCounter = 0
            let confirmedCounter = 0

            for(row of result) {
                allOrders[row.user_id].push([row.user_name, row.order_time, row.order_list, row.order_cost, row.confirmed])
                ++allCounter
                if(row.confirmed)
                    ++confirmedCounter
            }

            await bot.sendMessage(chatId, "Всего заказов за сегодня: " + (allCounter).toString() + "\n\n", {parse_mode: 'Markdown'})
            await bot.sendMessage(chatId, "Не оформлено: " + (allCounter - confirmedCounter).toString() + "\n\n", {parse_mode: 'Markdown'})

            unconfirmedOrders = {}

            for(user in allOrders) {
                unconfirmedOrders[user] = false
                for(userOrder in allOrders[user])
                    if(allOrders[user][userOrder][4] == false) {
                        unconfirmedOrders[user] = true
                        break
                    }
            }

            for(user in allOrders) {
                if(!unconfirmedOrders[user])
                    continue
                let currentText = "Заказы пользователя " + "*" + allOrders[user][0][0] + "*" + "\n\n"
                let k = 1
                for(userOrder in allOrders[user]) {
                    if(allOrders[user][userOrder][4] == false) {
                        currentText += "*" + k.toString() + "*" + "\n\n"
                        currentText += "Время заказа: " + "*" + allOrders[user][userOrder][1] + "*" + "\n\n"
                        currentText += allOrders[user][userOrder][2]
                        currentText += "Стоимость заказа: " + allOrders[user][userOrder][3] + " " + "рублей" + "\n\n"
                        ++k
                    }
                    else 
                        continue
                }
                await bot.sendMessage(chatId, currentText, {parse_mode: 'Markdown'})
            }
            
            if(confirmedCounter == allCounter)
                return 

            return bot.sendMessage(chatId, "Подтвердить оформление заказов: /confirm", {parse_mode: 'Markdown'})
        }

        // история заказов за неделю
        if(text == '/history') {
            let historyData = {}
            for(let shift = 0; shift <= 6; ++shift) {
                let date = new Date()
                date.setDate(date.getDate() - shift)
                date = date.toLocaleDateString()
                let result = await getHistory(date, chatId.toString())

                if(result.length == 0)
                    continue

                historyData[date] = []

                for(row of result)
                    historyData[date].push([row.order_time, row.order_list, row.order_cost, row.confirmed])
            }

            let totalPrice = 0

            for(date in historyData) {
                let currentText = "*" + date + "*" + "\n\n"
                let k = 1
                for(order in historyData[date]) {
                    currentText += "*" + k.toString() + "*" + "\n\n"
                    currentText += "Время заказа: " + "*" + historyData[date][order][0] + "*" + "\n\n"
                    currentText += historyData[date][order][1]
                    currentText += "Стоимость заказа: " + historyData[date][order][2] + " " + "рублей" + "\n\n"
                    currentText += "Статус заказа: " 
                    if(historyData[date][order][3] == 0 || historyData[date][order][3] == null)
                        currentText += "*не оформлен*" + "\n\n"
                    else {
                        currentText += "*оформлен*" + "\n\n"
                        totalPrice += historyData[date][order][2]
                    }
                    ++k
                }
                await bot.sendMessage(chatId, currentText, {parse_mode: 'Markdown'})
            }

            return bot.sendMessage(chatId, "Общая стоимость оформленных заказов за последнюю неделю: " + totalPrice + " " + "рублей", {parse_mode: 'Markdown'})
        }

        // недельный отчёт о стоимости оформленных заказов по каждому пользователю
        if(text == '/report') {
            let weekOrders = []

            let users = (await getUsers())

            let usersCost = {}

            for(let shift = 0; shift <= 6; ++shift) {
                let date = new Date()
                date.setDate(date.getDate() - shift)
                date = date.toLocaleDateString()

                let result = (await getOrders(date))

                for(row of result)
                    weekOrders.push([row.user_id, row.user_name, row.order_time, row.order_list, row.order_cost, row.confirmed])
            }

            for(row of users)
                usersCost[row.user_id] = [0, row.user_name]

            for(order in weekOrders) {
                if(weekOrders[order][5])
                    usersCost[weekOrders[order][0]][0] += weekOrders[order][4]
            }

            let currentText = ""

            for(user in usersCost) {
                currentText += "*" + usersCost[user][1] + "*" + "\n\n"
                currentText += "Общая стоимость оформленных заказов: " + usersCost[user][0].toString() + " " + "рублей" + "\n\n"
            }

            return bot.sendMessage(chatId, currentText, {parse_mode: 'Markdown'})

        }

        // команды
        if(text == '/commands') {
            let currentText = ""

            for(current in commands)
                if(commands[current]["command"] != "/commands")
                    currentText += "*" + commands[current]["command"] + "*" + " - " + commands[current]["description"] + "\n\n"
            
            if(currentText == "")
                return bot.sendMessage(chatId, "Команд не существует")

            return bot.sendMessage(chatId, currentText, {parse_mode: 'Markdown'})
        }

        return bot.sendMessage(chatId, 'Чтобы посмотреть доступные команды, введите */commands*', {parse_mode: 'Markdown'})
    })
}

// запуск бота
runBot()