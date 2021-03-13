import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let ch = vscode.window.createOutputChannel("C/C++ Build");

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
                    invoke(rootPath, file);
                } else {
                    vscode.commands.executeCommand('workbench.action.terminal.new').then(_ => {
                        invoke(rootPath, file);
                    });
                }
            } else {
                vscode.window.showInformationMessage("Please open active C/C++ file");
            }
        }
    });

    let showTerm = vscode.commands.registerCommand('bldr.terminal', () => {
        if (ensureTerminalExists()) {
            selectTerminal().then(it => {
                if (it) {
                    it.show();
                }
            });
        } else {
            vscode.commands.executeCommand('workbench.action.terminal.new');
        }
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(showTerm);
}

// this method is called when your extension is deactivated
export function deactivate() {
    ch.dispose();
}

function invoke(rootPath: string | undefined, file: string) {
    selectTerminal().then(it => {
        if (it && typeof rootPath !== 'undefined') {
            run(it, file, rootPath);
        }
    });
}

function run(t: vscode.Terminal, file: string, rootPath: string) {
    var separator = '\\';
    if (isTermLinux(t.name)) {
        separator = '/'
        file = file.replace('\\', separator);
    }
    const ext = file.split('.')[1];

    if (file.includes(separator)) {
        const dir = file.substring(0, file.lastIndexOf(separator));
        if (!fs.existsSync(rootPath + separator + "out" + separator + dir)) {
            createFileOrFolder('folder', "out" + separator + dir);
        }
    }
    var out = "out" + separator + file.split('.')[0];

    if (os.type().toLocaleLowerCase().includes("windows")) {
        out += ".exe";
    }

    ch.show();
    ch.clear();
    ch.appendLine("Building " + file);

    const { exec } = require('child_process');
    exec("cd " + rootPath + " && " + (ext === "c" ? "gcc" : "g++") + " -o " + out + " " + file + " -Werror", (err: any, stdout: string, stderr: any) => {
        if (err) {
            ch.appendLine(stderr);
        } else {
            ch.clear();
            ch.hide();

            t.show();
            if (isTermLinux(t.name)) {
                t.sendText("clear");
            }
            t.sendText("." + separator + out);
        }
    });
}

function isTermLinux(name: string) {
    return name !== "cmd" && name !== "powershell";
}

function getTermDetail(name: string) {
    switch (name) {
        case "bash":
            return "Bash";

        case "wsl":
            return "WSL Bash";

        case "cmd":
            return "Command Prompt";

        case "powershell":
            return "Windows Powershell";

        default:
            return "N/A";
    }
}

//------------------------------

async function selectTerminal(): Promise<vscode.Terminal | undefined> {
    interface PickItem extends vscode.QuickPickItem {
        terminal: vscode.Terminal;
    }
    const terminals = <vscode.Terminal[]>(<any>vscode.window).terminals;
    if (terminals.length >= 2) {
        const items: PickItem[] = terminals.map(t => {
            return {
                label: t.name,
                detail: getTermDetail(t.name),
                terminal: t,
            };
        });
        const it = await vscode.window.showQuickPick(items);
        return it ? it.terminal : undefined;
    } else {
        return terminals[0];
    }
}

function ensureTerminalExists(): boolean {
    return (<any>vscode.window).terminals.length !== 0;
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
