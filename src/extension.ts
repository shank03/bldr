import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let ch = vscode.window.createOutputChannel("C/C++ Build");
let statusItem: vscode.StatusBarItem;

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('bldr.build', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            var rootPath = vscode.workspace.rootPath;
            var file = editor.document.fileName;

            if (typeof rootPath !== 'undefined' && (file.endsWith(".cpp") || file.endsWith(".c"))) {
                file = file.substring(rootPath.length + 1);

                if (!fs.existsSync(rootPath + "/out")) {
                    createFileOrFolder('folder', "out");
                }
                if (ensureTerminalExists()) {
                    const terminal = getTerminal();
                    if (terminal) {
                        run(terminal, file, rootPath);
                    } else {
                        vscode.window.showInformationMessage("Bash shell not found");
                    }
                }
            } else {
                vscode.window.showInformationMessage("Please open active C/C++ file");
            }
        }

        if (!statusItem) {
            createStatusItem(context);
        }
    });

    if (!statusItem) {
        createStatusItem(context);
    }

    context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {
    ch.dispose();
    if (statusItem) {
        statusItem.hide();
        statusItem.dispose();
    }
}

function createStatusItem(context: vscode.ExtensionContext) {
    statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusItem.command = 'bldr.build';
    statusItem.text = "$(debug-alt-small) Build and Run active file [C/C++]";
    context.subscriptions.push(statusItem);

    context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(updateStatusItem));
    context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(updateStatusItem));
    updateStatusItem();
}

function updateStatusItem() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        var rootPath = vscode.workspace.rootPath;
        var file = editor.document.fileName;

        if (typeof rootPath !== 'undefined' && (file.endsWith(".cpp") || file.endsWith(".c"))) {
            file = file.substring(rootPath.length + 1).replace('\\', '/');
            statusItem.text = "$(debug-alt-small) Build and Run [" + file + "]";
            statusItem.show();
        } else {
            statusItem.hide();
        }
    } else {
        statusItem.hide();
    }
}

function run(t: vscode.Terminal, file: string, rootPath: string) {
    file = file.replace('\\', '/');
    const ext = file.split('.')[1];

    let platform = os.type();

    if (file.includes('/')) {
        const dir = file.substring(0, file.lastIndexOf('/'));
        if (!fs.existsSync(rootPath + "/out/" + dir)) {
            createFileOrFolder('folder', "out/" + dir);
        }
    }
    var out = "out/" + file.split('.')[0];
    if (platform !== "Linux") {
        out += ".exe";
    }

    ch.show();
    ch.clear();
    ch.appendLine("Building " + file);

    const { exec } = require('child_process');
    exec("cd " + rootPath + " && " + (ext === "c" ? "gcc" : "g++") + " -o " + out + " " + file + " -Werror", (err: any, stdout: any, stderr: any) => {
        if (err) {
            ch.appendLine(stderr);
        } else {
            ch.clear();
            ch.hide();

            t.show();
            t.sendText("clear");
            t.sendText("./" + out);
        }
    });
}

//------------------------------

function getTerminal(): vscode.Terminal | undefined {
    const terminals = <vscode.Terminal[]>(<any>vscode.window).terminals;
    for (let i = 0; i < terminals.length; i++) {
        if (terminals[i].name === 'bash') {
            return terminals[i];
        }
    }
    return undefined;
}

function ensureTerminalExists(): boolean {
    if ((<any>vscode.window).terminals.length === 0) {
        vscode.window.showErrorMessage('No active terminals');
        return false;
    }
    return true;
}

//--------------------------------

function createFileOrFolder(taskType: 'file' | 'folder', relativePath?: string) {
    relativePath = relativePath || '/';
    const wfolders = vscode.workspace.workspaceFolders;
    if (typeof wfolders === 'undefined') {
        return;
    }
    const projectRoot = wfolders[0].uri.fsPath;
    if (path.resolve(relativePath) === relativePath)
        relativePath = relativePath.substring(projectRoot.length).replace(/\\/g, "/");

    if (!relativePath.endsWith("/")) relativePath += '/';
    const basepath = projectRoot;

    try {
        let paths = relativePath.split('>').map(e => e.trim());
        let targetpath = taskType === 'file' ? path.dirname(paths[0]) : paths[0];
        paths[0] = taskType === 'file' ? path.basename(paths[0]) : '/';
        targetpath = path.join(basepath, targetpath);
        paths = paths.map(e => path.join(targetpath, e));

        if (taskType === 'file') {
            makefiles(paths);
        } else {
            makefolders(paths);
        }
    } catch (error) {
        // logError(error);
        vscode.window.showErrorMessage("Somthing went wrong! Please report on GitHub");
    }
}

function makefiles(filepaths: string[]) {
    filepaths.forEach(filepath => makeFileSync(filepath));
}

function makefolders(files: string[]) {
    files.forEach(file => makeDirSync(file));
}

function makeDirSync(dir: string) {
    if (fs.existsSync(dir)) return;
    if (!fs.existsSync(path.dirname(dir))) {
        makeDirSync(path.dirname(dir));
    }
    fs.mkdirSync(dir);
}

function makeFileSync(filename: string) {
    if (!fs.existsSync(filename)) {
        makeDirSync(path.dirname(filename));
        fs.createWriteStream(filename).close();
    }
}
