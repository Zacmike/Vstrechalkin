import { Telegraf } from 'telegraf';
import schedule from 'node-schedule';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import puppeteer from 'puppeteer';
import axios from 'axios'; 

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url)));

const bot = new Telegraf(config.TELEGRAM_BOT_TOKEN);

let users = [];
let sentMeetings = new Set();

if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'));
    console.log('Загружены пользователи:', users);
} else {
    console.log('Файл users.json не найден. Создаем новый список пользователей.');
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const checkSiteAvailability = async () => {
    try {
        const response = await axios.get(config.TARGET_URL, {
            timeout: 30000,
            validateStatus: function (status) {
                return status >= 200 && status < 300; // Принимаем только успешные статусы
            }
        });
        console.log(`Статус ответа: ${response.status}`);
        return true;
    } catch (error) {
        console.error(`Ошибка при проверке доступности сайта: ${error.message}`);
        return false;
    }
};

const checkMeetings = async () => {
    try {
        console.log('Начало проверки встреч...');

        // Проверяем доступность сайта
        const isSiteAvailable = await checkSiteAvailability();
        if (!isSiteAvailable) {
            console.log('Сайт недоступен. Пропускаем проверку.');
            return;
        }


        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });

        const page = await browser.newPage();

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

        // Добавляем отладочную информацию
        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
        page.on('requestfailed', request => console.log('FAILED REQUEST:', request.url()));

        let attempts = 0;
        while (attempts < 3) {
            try {
                console.log(`Попытка ${attempts + 1} загрузки страницы...`);
                await page.goto(config.TARGET_URL, { waitUntil: 'networkidle0', timeout: 60000 });
                console.log('Страница успешно загружена');
                break;
            } catch (error) {
                console.log(`Попытка ${attempts + 1} не удалась: ${error.message}`);
                attempts++;
                if (attempts >= 3) throw error;
                await delay(10000);
            }
        }

        await page.waitForSelector('.meeting-availability', { timeout: 30000 });

        const meetingInfo = await page.evaluate(() => {
            let info = '';
            document.querySelectorAll('.meeting-availability').forEach(elem => {
                const city = elem.querySelector('.city-name').textContent.trim();
                const building = elem.querySelector('.building-name').textContent.trim();
                const availableDates = elem.querySelector('.available-dates').textContent.trim();
                if (availableDates.includes('доступны')) {
                    info += `Город: ${city}\nЗдание: ${building}\nДоступные даты: ${availableDates}\n\n`;
                }
            });
            return info;
        });

        console.log('Извлеченная информация:', meetingInfo);

        if (meetingInfo) {
            console.log('Найдена новая информация. Отправка сообщений...');
            for (const chatId of users) {
                try {
                    await bot.telegram.sendMessage(chatId, 'Доступны новые встречи:\n\n' + meetingInfo);
                    console.log(`Сообщение отправлено пользователю ${chatId}`);
                } catch (error) {
                    console.error(`Ошибка при отправке уведомления пользователю ${chatId}:`, error);
                }
            }
        } else {
            console.log('Новой информации не найдено.');
        }

        await browser.close();
    } catch (error) {
        console.error('Ошибка при проверке встреч:', error);
    }
};

schedule.scheduleJob('* * * * *', checkMeetings);

console.log('Попытка запуска бота...');
bot.launch().then(() => {
    console.log('Бот успешно запущен');
}).catch((error) => {
    console.error('Ошибка при запуске бота:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Необработанное отклонение промиса:', reason);
});

process.once('SIGINT', () => {
    console.log('Получен сигнал SIGINT. Остановка бота...');
    bot.stop('SIGINT');
});
process.once('SIGTERM', () => {
    console.log('Получен сигнал SIGTERM. Остановка бота...');
    bot.stop('SIGTERM');
});

bot.telegram.getMe().then((botInfo) => {
    console.log(`Бот подключен. Имя бота: ${botInfo.first_name}`);
}).catch((error) => {
    console.error('Ошибка при получении информации о боте:', error);
});
