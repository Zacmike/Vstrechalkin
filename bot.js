const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');
const { Telegraf } = require('telegraf');
const schedule = require('node-schedule');
const cheerio = require('cheerio');
const fs = require('fs');
const config = require('./config.json');

// Инициализация бота с использованием токена из config.json
const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

let users = [];

// Загрузка сохраненных пользователей из файла
if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'));
}

// Обработка команды /start для подписки на уведомления
bot.start((ctx) => {
    const chatId = ctx.chat.id;
    if (!users.includes(chatId)) {
        users.push(chatId);
        fs.writeFileSync('users.json', JSON.stringify(users));
        ctx.reply('Привет! Я буду уведомлять вас о наличии встреч на сайте ICP.');
    } else {
        ctx.reply('Вы уже подписаны на уведомления.');
    }
});

// Обработка команды /stop для отписки от уведомлений
bot.command('stop', (ctx) => {
    const chatId = ctx.chat.id;
    users = users.filter(user => user !== chatId);
    fs.writeFileSync('users.json', JSON.stringify(users));
    ctx.reply('Вы отписались от уведомлений.');
});

// Запуск бота
bot.launch();

// Функция для проверки встреч на сайте
const checkMeetings = async () => {
    try {
        // Настройка прокси для подключения через испанский IP-адрес
        const proxy = 'https://icp.administracionelectronica.gob.es/icpplus/index.html'; // Замените на реальный адрес и порт испанского прокси
        const agent = new HttpsProxyAgent(proxy);

        const response = await fetch(config.TARGET_URL, { agent });
        const body = await response.text();
        const $ = cheerio.load(body);

        let meetingInfo = '';

        // Пример извлечения данных с сайта, может понадобиться адаптация под реальную структуру сайта
        $('.meeting-availability').each((i, elem) => {
            const city = $(elem).find('.city-name').text();
            const building = $(elem).find('.building-name').text();
            const availableDates = $(elem).find('.available-dates').text();
            if (availableDates.includes('доступны')) {
                meetingInfo += `Город: ${city}\nЗдание: ${building}\nДоступные даты: ${availableDates}\n\n`;
            }
        });

        if (meetingInfo) {
            users.forEach(chatId => {
                bot.telegram.sendMessage(chatId, 'Доступны новые встречи:\n\n' + meetingInfo);
            });
        }
    } catch (error) {
        console.error('Ошибка при проверке встреч:', error);
    }
};

// Установка задачи на выполнение каждую минуту
schedule.scheduleJob('* * * * *', checkMeetings);