import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

let ch = vscode.window.createOutputChannel("C/C++ Build");
const TAG = "Build [C/C++]:";
const LIB_TAG = "// libs:";

interface Root {
    tasks: Task[]
    version: string
}

interface tOptions {
    cwd: string;
}

interface Task {
    type: string
    label: string
    command: string
    args: string[]
    options: tOptions
    problemMatcher: string[]
    group: object
    detail: string
}

interface CompilerItem {
    label: string
    description: string
}

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
                invoke(rootPath, file, editor);
            } else {
                vscode.window.showInformationMessage('No active C/C++ file', {
                    modal: true,
                    detail: 'Please give focus to the C/C++ file you want to compile.'
                });
            }
        }
    });

    let cleanExecs = vscode.commands.registerCommand('bldr.clear.execs', () => {
        const path = vscode.workspace.rootPath;
        if (path) deleteExecs(path);
    });

    let showTerm = vscode.commands.registerCommand('bldr.terminal', () => {
        initializeTerminal().then(it => it.show());
    });

    let debugFile = vscode.commands.registerCommand('bldr.run.debug', () => {
        var separator = '\\';
        const isWin: boolean = os.type().toLocaleLowerCase().includes("windows");
        if (!isWin) separator = '/'

        const tasksFile: string = vscode.workspace.rootPath + "/.vscode/tasks.json";
        if (!fs.existsSync(vscode.workspace.rootPath + "/.vscode")) createFileOrFolder('folder', ".vscode");
        if (!fs.existsSync(tasksFile)) {
            createFileOrFolder('file', ".vscode" + separator + "tasks.json");
            fs.writeFileSync(tasksFile, cppBuildTaskData);
        }
        let obj: Root = JSON.parse(fs.readFileSync(tasksFile).toString());

        const { exec } = require('child_process');
        let compilerList: CompilerItem[] = [];
        let command = (isWin ? "where" : "whereis") + " g++ gcc clang clang++ clang-cl clang-cpp cpp" + (isWin ? "" : " | grep bin");
        exec(command, (_: any, stdout: string, __: any) => {
            stdout.split('\n').forEach(element => {
                while (element.includes("\r")) element = element.replace("\r", "");
                if (element.length >= 2) {
                    if (!isWin) {
                        element.split(" ").forEach((subEle) => {
                            if (subEle.includes("bin")) compilerList.push({ label: element.substring(0, element.lastIndexOf(":")), description: subEle });
                        });
                    } else {
                        compilerList.push({ label: element.substring(element.lastIndexOf(separator) + 1), description: element })
                    }
                }
            });
            compilerList.sort((a, b) => b.label.localeCompare(a.label));
            console.log("Compilers:", compilerList);

            vscode.window.showQuickPick(compilerList, { placeHolder: 'Select a compiler to start debugging' }).then((val) => {
                if (!val) return;

                while (val.description.includes("\\")) val.description = val.description.replace("\\", "/");
                obj.tasks[obj.tasks.length - 1].command = val.description;
                obj.tasks[obj.tasks.length - 1].options.cwd = isWin ? val.description.substring(0, val.description.lastIndexOf('/')) : "${fileDirname}";

                if (!isWin) {
                    let args: string[] = [];
                    for (var str of obj.tasks[obj.tasks.length - 1].args) args.push(str.replace(".exe", ""));
                    obj.tasks[obj.tasks.length - 1].args = args;
                }

                fs.writeFileSync(tasksFile, JSON.stringify(obj, null, 4));
                vscode.commands.executeCommand('C_Cpp.BuildAndDebugFile');
            });
        });
    });

    let genFormat = vscode.commands.registerCommand('bldr.c_format', () => {
        fs.writeFileSync(vscode.workspace.rootPath + "/.clang-format", formatData);
    });

    context.subscriptions.push(disposable);
    context.subscriptions.push(showTerm);
    context.subscriptions.push(debugFile);
    context.subscriptions.push(genFormat);
    context.subscriptions.push(cleanExecs);
}

// this method is called when your extension is deactivated
export function deactivate() {
    ch.dispose();
}

function invoke(rootPath: string | undefined, file: string, editor: vscode.TextEditor) {
    vscode.commands.executeCommand('workbench.action.files.save');
    initializeTerminal("C/C++ Build").then(it => {
        if (it && typeof rootPath !== 'undefined') {
            processHeaderLibs(it, file, rootPath, editor);
        }
    });
}

function run(t: vscode.Terminal, file: string, rootPath: string, headersImp: Array<string>, libs: Array<string>, hasMath: boolean) {
    var separator = '\\';
    const isWin: boolean = os.type().toLocaleLowerCase().includes("windows");
    if (!isWin) {
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
    if (isWin) out += ".exe";

    ch.show(true);
    ch.clear();
    ch.appendLine("Building " + file);

    const { exec } = require('child_process');

    out = "\"" + out + "\"";
    file = "\"" + file + "\"";

    var buildCmd = "cd \"" + rootPath + "\" && " + (ext === "c" ? "gcc" : "g++") + " -o " + out + " " + file;
    for (var header of headersImp) buildCmd += " " + dir + separator + header;
    buildCmd += " -Wall"

    ch.appendLine(`Libs: ${libs.toString()}`)
    ch.appendLine("Command:")

    for (var l of libs) buildCmd += " -l" + l;
    if (hasMath) buildCmd += " -lm";

    ch.appendLine(buildCmd)
    if (isWin) {
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
            ch.appendLine("Build Success");

            t.show();
            separator = "/";
            if (path.basename(vscode.env.shell) === "cmd.exe") {
                separator = "\\";
                const sepCount = out.split('/').length
                for (let i = 0; i < sepCount; i++) {
                    out = out.replace('/', separator);
                }
                t.sendText("cls");
            } else {
                t.sendText("clear");
            }
            t.sendText("." + separator + out);
        }
    });
}

function processHeaderLibs(t: vscode.Terminal, file: string, rootPath: string, editor: vscode.TextEditor) {
    if (file.endsWith(".c")) {
        var libs: Array<string> = [];
        let hasMath = false;
        editor.document.getText().split('\n').forEach(it => {
            it = it.trim();
            if (it.startsWith(LIB_TAG)) {
                it = it.split(':')[1].trim();

                let potentialLibs = it.split(' ');
                if (potentialLibs.length >= 1) {
                    for (var l of potentialLibs) {
                        if (!libs.includes(l)) {
                            libs.push(l);
                        }
                    }
                }
            }

            if (!hasMath) {
                hasMath = it.startsWith("#include") && it.includes("math.h");
            }
        });
        run(t, file, rootPath, [], libs, hasMath);
        return;
    }
    const separator = os.type().toLocaleLowerCase().includes("windows") ? '\\' : '/';

    var foundHeaders: Array<string> = [];
    var libs: Array<string> = [];
    let hasMath = false;
    editor.document.getText().split('\n').forEach(it => {
        it = it.trim()
        if (it.startsWith("#include") && it.includes("\"") && !it.includes(".hpp")) {
            foundHeaders.push(it.substring(it.indexOf('\"', 0) + 1, it.lastIndexOf('\"')));
        } else if (it.startsWith(LIB_TAG)) {
            it = it.split(':')[1].trim();

            let potentialLibs = it.split(' ');
            if (potentialLibs.length >= 1) {
                for (var l of potentialLibs) {
                    if (!libs.includes(l)) {
                        libs.push(l);
                    }
                }
            }
        }

        if (!hasMath) {
            hasMath = it.startsWith("#include") && it.includes("math.h");
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
            run(t, file, rootPath, localHeaders, libs, hasMath);
        }
    };
    inputHeader(foundHeaders[i]);
}

async function initializeTerminal(termName: string | undefined = undefined): Promise<vscode.Terminal> {
    const terminals = <vscode.Terminal[]>(<any>vscode.window).terminals;
    if (terminals.length == 0) return vscode.window.createTerminal({});

    var terminal: vscode.Terminal | undefined = undefined;
    if (termName) {
        for (let i = 0; i < terminals.length; i++) {
            if (terminals[i].name === termName) {
                terminal = terminals[i];
                break;
            }
        }
    } else {
        terminal = terminals[0];
    }
    if (!terminal) return vscode.window.createTerminal({ name: termName });
    return terminal;
}

//--------------------------------

function deleteExecs(path: string) {
    const separator = os.type().toLocaleLowerCase().includes("windows") ? "\\" : "/";
    fs.readdirSync(path).forEach(file => {
        file = path + separator + file;
        if (fs.existsSync(file)) {
            if (fs.lstatSync(file).isDirectory()) deleteExecs(file);

            if (fs.lstatSync(file).isFile() && (file.endsWith(".exe") || !file.includes("."))) {
                try {
                    fs.unlinkSync(file);
                    console.log(TAG, "Deleted: " + file);
                } catch (error) {
                    console.log(TAG, "Exec Del: " + error);
                }
            }
        }
    });
}

function createFileOrFolder(taskType: 'file' | 'folder', relativePath?: string) {
    relativePath = relativePath || '/';
    const wfolders = vscode.workspace.workspaceFolders;
    if (typeof wfolders === 'undefined') return;

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
    if (!fs.existsSync(path.dirname(dir))) makeDirSync(path.dirname(dir));
    fs.mkdirSync(dir);
}

function makeFileSync(filename: string) {
    if (fs.existsSync(filename)) return;
    makeDirSync(path.dirname(filename));
    fs.createWriteStream(filename).close();
}

const cppBuildTaskData = `
{
    "tasks": [
        {
            "type": "cppbuild",
            "label": "C/C++: build active file",
            "command": "",
            "args": [
                "-fdiagnostics-color=always",
                "-g",
                "\${file}",
                "-o",
                "\${fileDirname}/\${fileBasenameNoExtension}.exe"
            ],
            "options": {
                "cwd": ""
            },
            "problemMatcher": [
                "$gcc"
            ],
            "group": {
                "kind": "build",
                "isDefault": true
            },
            "detail": "Task generated by Debugger."
        }
    ],
    "version": "2.0.0"
}
`;

const formatData = `# Generated from CLion C/C++ Code Style settings
BasedOnStyle: Google
AccessModifierOffset: -4
AlignAfterOpenBracket: true
AlignArrayOfStructures: Right
AlignConsecutiveAssignments: AcrossComments
AlignConsecutiveDeclarations: AcrossComments
AlignConsecutiveMacros: AcrossComments
AlignEscapedNewlines: Left
AlignOperands: true
AlignTrailingComments: true
AllowAllArgumentsOnNextLine: false
AllowAllConstructorInitializersOnNextLine: false
AllowAllParametersOfDeclarationOnNextLine: false
AllowShortBlocksOnASingleLine: Always
AllowShortCaseLabelsOnASingleLine: true
AllowShortEnumsOnASingleLine: true
AllowShortFunctionsOnASingleLine: All
AllowShortIfStatementsOnASingleLine: AllIfsAndElse
AllowShortLambdasOnASingleLine: All
AllowShortLoopsOnASingleLine: true
AlwaysBreakAfterReturnType: None
AlwaysBreakTemplateDeclarations: Yes
BinPackArguments: true
BinPackParameters: true
BitFieldColonSpacing: Both
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
  BeforeLambdaBody: false
  IndentBraces: false
  SplitEmptyFunction: false
  SplitEmptyRecord: false
  SplitEmptyNamespace: false
BreakBeforeBinaryOperators: All
BreakBeforeConceptDeclarations: Always
BreakBeforeTernaryOperators: true
BreakConstructorInitializers: BeforeColon
BreakInheritanceList: BeforeColon
ColumnLimit: 0
CompactNamespaces: false
ContinuationIndentWidth: 8
Cpp11BracedListStyle: false
EmptyLineBeforeAccessModifier: LogicalBlock
FixNamespaceComments: true
IncludeBlocks: Regroup
IndentAccessModifiers: false
IndentCaseLabels: true
IndentExternBlock: Indent
IndentGotoLabels: true
IndentPPDirectives: AfterHash
IndentWidth: 4
IndentWrappedFunctionNames: true
KeepEmptyLinesAtTheStartOfBlocks: false
LambdaBodyIndentation: Signature
MaxEmptyLinesToKeep: 1
NamespaceIndentation: All
ObjCSpaceAfterProperty: true
ObjCSpaceBeforeProtocolList: true
PackConstructorInitializers: CurrentLine
PointerAlignment: Left
QualifierAlignment: Left
ReferenceAlignment: Left
ReflowComments: true
SeparateDefinitionBlocks: Always
SortIncludes: CaseSensitive
SpaceAfterCStyleCast: true
SpaceAfterLogicalNot: false
SpaceAfterTemplateKeyword: true
SpaceBeforeAssignmentOperators: true
SpaceBeforeCaseColon: false
SpaceBeforeCpp11BracedList: true
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
UseCRLF: false
UseTab: Never
`;
