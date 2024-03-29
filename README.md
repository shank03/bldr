# Builder (bldr) README

Simple extension for one-click build of active C/C++ files

> Note: Not intended for public use as this extension doesn't meet the standards. But it works and anyone can use.

## Features

Builds your active C/C++ file with one click.

It creates and `out` dir in your workspace where the compiled programs are stored and run.

You can link libraries in compile command, just add this line in your code:<br>
`// libs:pthread libname1 libname2 libnameN`

## Requirements

- Linux: nothing needed
- Windows: mingw should be installed OR use wsl (vscode should also be open in wsl)

## Release Notes

### 2.1.2

- Fixed executing build command in WSL
- Channel output print whether build was success

<details>
<summary>Click to expand previous notes</summary>

### 2.1.1

Compiled program will now be executed in separate terminal by name `C/C++ Build`.<br>
So that it doesn't interfere with ongoing processe(s).

### 2.1.0

- Fixed editor focus bugs
- Added a command to clean (delete) all the built executable files.

### 2.0.1

Improved execution on different terminals.

### 2.0.0

Automatically save the current editor file when running command.

### 1.9.1

Link math library when included `math.h`

### 1.9.0

Added feature to link libraries in compile command.

**How ?** <br>
Add this line in your code:<br>
`// libs:libname1 libname2 libnameN`

### 1.8.1

Added fix for accessing paths in windows when partition is different

### 1.8.0

Added command to generate `.clang-format` for formatting C/C++ code

### 1.7.0

Added feature to handle headers in `cpp` files

### 1.6.0

Added a button to debug active file.<br>
Required extension: `ms-vscode.cpptools`

### 1.5.0

Added a button to show terminal

### 1.4.0

- Improve terminal and platform recognition
- Provide option to select terminal to run on when more than one terminal are open

### 1.3.0

- Remove the statusbar item
- Add "Run" button at the end of tabs instead

### 1.2.0

Create a build statusbar item after first build

### 1.1.0

Create an output channel to show errors clearly

### 1.0.0

Initial release of Builder
</details>

**Enjoy!**
