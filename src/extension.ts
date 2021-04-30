import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let ch = vscode.window.createOutputChannel("C/C++ Build");
const TAG = "Build [C/C++]:";

export function activate(context: vscode.ExtensionContext) {
    let disposable = vscode.commands.registerCommand('bldr.build', () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            var rootPath = vscode.workspace.rootPath;
            var file = editor.document.fileName;
            console.log(`${TAG} rootPath: ${rootPath}; filePath: ${file}`);

            if (typeof rootPath !== 'undefined' && (file.endsWith(".cpp") || file.endsWith(".c"))) {
                file = file.substring(rootPath.length + 1);
                console.log(`${TAG} file: ${file}`);

                if (!fs.existsSync(rootPath + "/out")) {
                    console.log(`${TAG} out folder doesn't exist... creating`);
                    createFileOrFolder('folder', "out");
                }
                if (ensureTerminalExists()) {
                    invoke(rootPath, file, editor);
                } else {
                    vscode.commands.executeCommand('workbench.action.terminal.new').then(_ => {
                        invoke(rootPath, file, editor);
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

    let debugFile = vscode.commands.registerCommand('bldr.run.debug', () => {
        vscode.commands.executeCommand('C_Cpp.BuildAndDebugActiveFile');
    });

    let genFormat = vscode.commands.registerCommand('bldr.c_format', () => {
        fs.writeFileSync(vscode.workspace.rootPath + "/.clang-format", formatData);
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(showTerm);
    context.subscriptions.push(debugFile);
    context.subscriptions.push(genFormat);
}

// this method is called when your extension is deactivated
export function deactivate() {
    ch.dispose();
}

function invoke(rootPath: string | undefined, file: string, editor: vscode.TextEditor) {
    selectTerminal().then(it => {
        if (it && typeof rootPath !== 'undefined') {
            processHeader(it, file, rootPath, editor);
        }
    });
}

function run(t: vscode.Terminal, file: string, rootPath: string, headersImp: Array<string>) {
    var separator = '\\';
    if (isTermLinux(t.name)) {
        separator = '/'
        const sepCount = file.split('\\').length
        for (let i = 0; i < sepCount; i++) {
            file = file.replace('\\', separator)
        }
    }
    const ext = file.split('.')[1];
    const dir = file.substring(0, file.lastIndexOf(separator));

    if (file.includes(separator)) {
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
    var buildCmd = "cd " + rootPath + " && " + (ext === "c" ? "gcc" : "g++") + " -o " + out + " " + file;
    for (var header of headersImp) {
        buildCmd += " " + dir + separator + header;
    }
    buildCmd += " -Wall"
    ch.appendLine("Command:")
    ch.appendLine(buildCmd)
    if (os.type().toLocaleLowerCase().includes("windows")) {
        console.log(`${TAG} run: windows`);
        exec("cd", (_: any, stdout: string, __: any) => {
            console.log(`${TAG} run: rootPart: ${rootPath.charAt(0).toLowerCase()}; currPart: ${stdout.charAt(0).toLowerCase()}`);
            if (rootPath.charAt(0).toLowerCase() !== stdout.charAt(0).toLowerCase()) {
                console.log(`${TAG} Partions not same`)
                buildCmd = rootPath.charAt(0) + ": && " + buildCmd;
            }
            build(buildCmd, separator, out, t);
        });
    } else {
        build(buildCmd, separator, out, t);
    }
}

function build(buildCmd: string, separator: string, out: string, t: vscode.Terminal) {
    const { exec } = require('child_process');
    console.log(`${TAG} build: buildCmd: ${buildCmd}`);
    exec(buildCmd, (err: any, _stdout: string, stderr: any) => {
        if (err) {
            ch.appendLine(stderr);
        } else {
            ch.hide();

            t.show();
            if (isTermLinux(t.name)) {
                t.sendText("clear");
            }
            t.sendText("." + separator + out);
        }
    });
}

function processHeader(t: vscode.Terminal, file: string, rootPath: string, editor: vscode.TextEditor) {
    if (file.endsWith(".c")) {
        run(t, file, rootPath, []);
        return;
    }
    const separator = os.type().toLocaleLowerCase().includes("windows") ? '\\' : '/';

    var foundHeaders: Array<string> = [];
    editor.document.getText().split('\n').forEach(it => {
        it = it.trim()
        if (it.startsWith("#include") && it.includes("\"")) {
            foundHeaders.push(it.substring(it.indexOf('\"', 0) + 1, it.lastIndexOf('\"')));
        }
    })

    const projectRoot = rootPath + separator + file.substring(0, file.lastIndexOf(separator)) + separator

    let i = 0;
    var localHeaders: Array<string> = [];
    const inputHeader = (header: string) => {
        if (i < foundHeaders.length) {
            if (fs.existsSync(projectRoot + header)) {
                if (fs.existsSync(projectRoot + header.split('.')[0] + ".cpp")) {
                    i++;
                    localHeaders.push(header.split('.')[0] + ".cpp");
                    inputHeader(foundHeaders[i]);
                } else {
                    vscode.window.showInputBox({
                        placeHolder: "Enter implementation file name for " + header,
                        validateInput: text => {
                            return fs.existsSync(projectRoot + text) && text.endsWith(".cpp") ? null : text;
                        }
                    }).then(it => {
                        if (typeof it !== 'undefined') {
                            localHeaders.push(it);
                            i++;
                            inputHeader(foundHeaders[i]);
                        }
                    });
                }
            } else {
                vscode.window.showWarningMessage(header + " not found");
            }
        } else {
            run(t, file, rootPath, localHeaders);
        }
    };
    inputHeader(foundHeaders[i]);
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

const formatData = `# Generated from CLion C/C++ Code Style settings
BasedOnStyle: LLVM
AccessModifierOffset: -4
AlignAfterOpenBracket: Align
AlignConsecutiveAssignments: false
AlignOperands: true
AllowAllArgumentsOnNextLine: false
AllowAllConstructorInitializersOnNextLine: false
AllowAllParametersOfDeclarationOnNextLine: false
AllowShortBlocksOnASingleLine: Always
AllowShortCaseLabelsOnASingleLine: false
AllowShortFunctionsOnASingleLine: All
AllowShortIfStatementsOnASingleLine: Always
AllowShortLambdasOnASingleLine: All
AllowShortLoopsOnASingleLine: true
AlwaysBreakAfterReturnType: None
AlwaysBreakTemplateDeclarations: Yes
BreakBeforeBraces: Custom
BraceWrapping:
  AfterCaseLabel: false
  AfterClass: false
  AfterControlStatement: Never
  AfterEnum: false
  AfterFunction: false
  AfterNamespace: false
  AfterUnion: false
  BeforeCatch: false
  BeforeElse: false
  IndentBraces: false
  SplitEmptyFunction: false
  SplitEmptyRecord: true
BreakBeforeBinaryOperators: None
BreakBeforeTernaryOperators: true
BreakConstructorInitializers: BeforeColon
BreakInheritanceList: BeforeColon
ColumnLimit: 0
CompactNamespaces: false
ContinuationIndentWidth: 8
IndentCaseLabels: true
IndentPPDirectives: None
IndentWidth: 4
KeepEmptyLinesAtTheStartOfBlocks: true
MaxEmptyLinesToKeep: 2
NamespaceIndentation: All
ObjCSpaceAfterProperty: false
ObjCSpaceBeforeProtocolList: true
PointerAlignment: Right
ReflowComments: false
SpaceAfterCStyleCast: true
SpaceAfterLogicalNot: false
SpaceAfterTemplateKeyword: false
SpaceBeforeAssignmentOperators: true
SpaceBeforeCpp11BracedList: false
SpaceBeforeCtorInitializerColon: true
SpaceBeforeInheritanceColon: true
SpaceBeforeParens: ControlStatements
SpaceBeforeRangeBasedForLoopColon: true
SpaceInEmptyParentheses: false
SpacesBeforeTrailingComments: 4
SpacesInAngles: false
SpacesInCStyleCastParentheses: false
SpacesInContainerLiterals: false
SpacesInParentheses: false
SpacesInSquareBrackets: false
TabWidth: 4
UseTab: Never
`;
