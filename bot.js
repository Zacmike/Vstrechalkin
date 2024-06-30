require('dotenv').config();
const puppeteer = require('puppeteer');
const axios = require('axios');
const winston = require('winston');

// Настройка логгера
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'cita_bot.log' })
  ]
});

class CitaBot {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      this.browser = await puppeteer.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.page = await this.browser.newPage();
      logger.info('Browser initialized');
    } catch (error) {
      logger.error(`Error initializing browser: ${error.message}`);
      throw error;
    }
  }

  async navigateToPage() {
    try {
      await this.page.goto('https://icp.administracionelectronica.gob.es/icpplus/index.html');
      logger.info('Navigated to main page');
      
      // Select province
      await this.page.select('#form', this.config.province);
      await this.page.click('input[type="submit"]');
      await this.page.waitForNavigation({ waitUntil: 'networkidle0' });
      
      // Select procedure
      await this.page.select('#tramiteGrupo\\[0\\]', this.config.operation_code);
      await this.page.click('input[type="submit"]');
      await this.page.waitForNavigation({ waitUntil: 'networkidle0' });

      logger.info('Selected province and procedure');
    } catch (error) {
      logger.error(`Error navigating: ${error.message}`);
      throw error;
    }
  }

  async solveCaptcha() {
    if (this.config.auto_captcha) {
      try {
        // Здесь должна быть реализация решения капчи
        // Например, с использованием сервиса anti-captcha.com
        logger.info('Auto-solving captcha');
        // Имитация задержки решения капчи
        await new Promise(resolve => setTimeout(resolve, 5000));
        logger.info('Captcha solved');
      } catch (error) {
        logger.error(`Error solving captcha: ${error.message}`);
        throw error;
      }
    } else {
      logger.info('Waiting for manual captcha solution');
      // Ожидание ручного решения капчи
      await this.page.waitForNavigation({ timeout: 300000 }); // 5 минут таймаут
    }
  }

  async fillForm() {
    try {
      await this.page.type('#txtIdCitado', this.config.doc_value);
      await this.page.type('#txtDesCitado', this.config.name);
      await this.page.type('#txtAnnoCitado', this.config.year_of_birth);
      await this.page.select('#txtPaisNac', this.config.country);
      await this.page.type('#txtTelefonoCitado', this.config.phone);
      await this.page.type('#emailUNO', this.config.email);
      await this.page.type('#emailDOS', this.config.email);
      
      logger.info('Form filled');
    } catch (error) {
      logger.error(`Error filling form: ${error.message}`);
      throw error;
    }
  }

  async selectAppointment() {
    try {
      await this.page.click('input[type="submit"]');
      await this.page.waitForNavigation({ waitUntil: 'networkidle0' });

      // Проверка наличия доступных слотов
      const availableSlots = await this.page.$$('.cita_disponible');
      if (availableSlots.length > 0) {
        logger.info('Appointment slot found');
        await availableSlots[0].click();
        await this.page.click('input[type="submit"]');
        logger.info('Appointment selected');
      } else {
        logger.info('No available appointments');
      }
    } catch (error) {
      logger.error(`Error selecting appointment: ${error.message}`);
      throw error;
    }
  }

  async run() {
    try {
      await this.initialize();
      await this.navigateToPage();
      await this.solveCaptcha();
      await this.fillForm();
      await this.selectAppointment();
      logger.info('Bot run completed');
    } catch (error) {
      logger.error(`Bot run failed: ${error.message}`);
    } finally {
      if (this.browser) {
        await this.browser.close();
        logger.info('Browser closed');
      }
    }
  }
}

// Конфигурация бота
const config = {
  auto_captcha: process.env.AUTO_CAPTCHA === 'true',
  anticaptcha_api_key: process.env.ANTICAPTCHA_API_KEY,
  province: process.env.PROVINCE,
  operation_code: process.env.OPERATION_CODE,
  doc_type: process.env.DOC_TYPE,
  doc_value: process.env.DOC_VALUE,
  name: process.env.NAME,
  year_of_birth: process.env.YEAR_OF_BIRTH,
  country: process.env.COUNTRY,
  phone: process.env.PHONE,
  email: process.env.EMAIL
};

// Запуск бота
const bot = new CitaBot(config);
bot.run().catch(error => logger.error(`Unhandled error: ${error.message}`));
