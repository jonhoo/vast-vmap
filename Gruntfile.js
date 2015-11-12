/*global module:false*/
module.exports = function (grunt) {

    // Project configuration.
    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        folders : {
            src : 'src/',
            dist: 'dist/',
            tests: 'test/'
        },
        uglify: {
            options: {
                banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
                    '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
                    '<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
                    '* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>;' +
                    ' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */\n'
            },
            build: {
                src: '<%= folders.src %>vast-vmap.js',
                dest: '<%= folders.dist %><%= pkg.name %>-<%= pkg.version %>.min.js'
            }
        },
        jshint: {
            all: ['Gruntfile.js', 'src/*.js'],
            options: {
                curly: true,
                eqeqeq: true,
                immed: true,
                latedef: true,
                newcap: true,
                noarg: true,
                sub: true,
                undef: true,
                boss: true,
                eqnull: true,
                browser: true,
                devel: true
            },
            globals: {}
        },
        buster: {
            config: '<%= folders.test %>buster.js'
        },
        watch: {
            tests: {
                files: ['<%= folders.tests %>' + '*.js', '<%= folders.src %>' + '*.js'],
                tasks: ['test']
            }
        }
    });

    // Default task.
    grunt.registerTask('default', ['jshint', 'uglify', 'test']);

    // Run tests
    grunt.registerTask('test', ['buster']);

    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-contrib-uglify');
    grunt.loadNpmTasks('grunt-contrib-watch');
    grunt.loadNpmTasks('grunt-buster');
};