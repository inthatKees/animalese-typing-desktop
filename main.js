const { app, Tray, BrowserWindow, Menu, ipcMain } = require('electron');
const path = require('path');
const iohook = require('iohook');
const os = require("os");
const Store = require('electron-store');

const SYSTRAY_ICON = path.join(__dirname, '/assets/images/icon.png');
const ICON = path.join(__dirname, '/assets/images/icon.png');
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // if another instance is already running then quit
    app.quit();
} else {
    app.on('second-instance', () => {
        // focus the existing window if it exists
        if (bgwin) {
            bgwin.show();
            bgwin.focus();
        }
    });
}
app.setAppUserModelId('com.joshxviii.animalese-typing');

var bgwin = null;
var tray = null;

const store = new Store({
    defaults: {
        lang: 'en',
        volume: 0.5,
        voice_profile: {
            voice_type: 'f2',
            pitch_shift: 0.0,
            pitch_variation: 0.2,
            intonation: 0.0
        },
        saved_voice_profiles: new Map()
    }
});

ipcMain.on('get-store-data-sync', (event) => {
    event.returnValue = store.store; // Returns entire store as an object
});
ipcMain.handle('store-set', async (e, key, value) => {
    store.set(key, value);
    bgwin.webContents.send(`updated-${key}`, value);
});

ipcMain.on('close-window', (e) => {
    if (bgwin) bgwin.close();
});
ipcMain.on('minimize-window', (e) => {
    if (bgwin) bgwin.minimize();
});

function createPopup() {
    if(bgwin !== null) return;
    bgwin = new BrowserWindow({
        width: 0,
        height: 0,
        icon: ICON,
        resizable: true,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });
    bgwin.removeMenu();
    bgwin.loadFile('editor.html');
    bgwin.setAspectRatio(2);
    bgwin.setMinimumSize(720, 360);
    
    bgwin.on('close', function (e) {
        if (!app.isQuiting) {
            if (process.platform === 'darwin') {
                app.dock.hide();
                e.preventDefault();
                bgwin.hide();
            } else {
                e.preventDefault();
                bgwin.hide();
            }
        }
        return false;
    });

    bgwin.on('closed', function () {
        bgwin = null;
    });

    bgwin.webContents.on('before-input-event', (e, input) => {
        if ((process.platform === 'darwin' ? input.meta : input.control) && input.shift && input.key.toLowerCase() === 'i') {
            const wc = bgwin.webContents;
            if (wc.isDevToolsOpened()) wc.closeDevTools();
            else  wc.openDevTools({ mode: 'detach' });
            e.preventDefault();
        }
    });
}

function createTrayIcon() {
    // prevent dupe tray icons
    if(tray !== null) return;

    tray = new Tray(SYSTRAY_ICON);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Settings',
            click: () => {
                if (bgwin) {
                    bgwin.show();
                    bgwin.focus();
                }
            }
        },
        {
            label: 'Run on startup',
            type: 'checkbox',
            checked: app.getLoginItemSettings().openAtLogin,
            click: (menuItem) => {
                app.setLoginItemSettings({
                    openAtLogin: menuItem.checked,
                    openAsHidden: true
                });
            }
        },
        {
            label: 'Quit',
            click: () => {
                iohook.unload();
                iohook.stop();
                app.quit();
            }
        }
    ]);

    if (process.platform === 'darwin') {
        app.dock.hide();
    }

    tray.on('click', () => {
        if (bgwin) {
            bgwin.show();
            bgwin.focus();
        }
    });

    tray.setToolTip('Animalese Typing');
    tray.setContextMenu(contextMenu);

    tray.displayBalloon({
        title: "Animalese Typing",
        content: "Animalese Typing is Running!"
    });    
}

app.whenReady().then(() => {
    createPopup();
    createTrayIcon();
});

app.on('activate', function () {
    if (bgwin === null) createPopup();
});

app.on('ready', () => {
    iohook.start();
    iohook.on('keydown', e => {
        bgwin.webContents.send('keydown', e);
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    iohook.unload();
    iohook.stop();

    if (bgwin) {
        bgwin.removeAllListeners();
        bgwin.close();
    }

    if (tray) tray.destroy();

    ipcMain.removeAllListeners();
});

app.on('quit', () =>  app.exit(0) );