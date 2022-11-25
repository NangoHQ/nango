#!/usr/bin/env node

/*
 * Copyright (c) 2022 Nango, all rights reserved.
 */

import { Command } from 'commander';

const program = new Command();

program.name('nango').description('A CLI tool to interact with Nango.');

program
    .command('init')
    .description('Initialize a new project.')
    .action(() => {
        initCommand();
    });
program.parse();

function initCommand() {
    console.log('Welcome to Nango! The open-source infrastructure for native integrations.');
}
