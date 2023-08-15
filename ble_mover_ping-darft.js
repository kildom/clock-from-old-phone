
const devName = 'Gerard';
const devService = '98bd0001-0b0e-421a-84e5-ddbf75dc6de4';
const devChar = '98bd0004-0b0e-421a-84e5-ddbf75dc6de4';

//let dev = null;

async function pingDeviceImpl() {
    let abortTimeout = null;
    let result = false;
    try {
        if (dev == null) {
            dev = await navigator.bluetooth.requestDevice({
                filters:[{name:devName}],
                optionalServices: [devService]});
            console.log(dev);
        }
        let aborted = new Promise((resolve, reject) => {
            abortTimeout = setTimeout(() => reject(new Error('Timeout')), 10000);
        });
        await Promise.race([dev.gatt.connect(), aborted]);
        console.log('BLE Connected', dev.gatt.connected);
        let serv = await Promise.race([dev.gatt.getPrimaryService(devService), aborted]);
        //console.log(serv);
        let char = await Promise.race([serv.getCharacteristic(devChar), aborted]);
        //console.log(char);
        let value = await Promise.race([char.readValue(), aborted]);
        console.log(value);
        await Promise.race([dev.gatt.disconnect(), aborted]);
        clearTimeout(abortTimeout);
        console.log('BLE Connected', dev.gatt.connected);
        result = true;
    } catch (ex) {
        if (abortTimeout !== null) {
            clearTimeout(abortTimeout);
        }
        console.warn(ex);
        try {
            if (dev && dev.gatt.connected) dev.gatt.disconnect();
        } catch (ex) {}
    }
    await new Promise(resolve => setTimeout(resolve, 7000));
    return result;
}

async function pingDevice() {
    let ok = await pingDeviceImpl();
    for (let i = 0; i < 3 && !ok; i++) {
        console.log('------------- RETRY ', i+1, 'of', 3);
        try {
            dev.disconnect();
        } catch (ex) {}
        await new Promise(resolve => setTimeout(resolve, 7000));
        try {
            dev.disconnect();
        } catch (ex) {}
        await new Promise(resolve => setTimeout(resolve, 1000));
        ok = await pingDeviceImpl();
    }
    return ok;
}

for (let i = 0; i < 20; i++) {
    console.log('----------------------------------------', i);
    console.warn(await pingDevice());
}

