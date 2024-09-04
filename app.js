const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

// Set up middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');

// Set up session management
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key', // Use environment variable for secret
    resave: false,
    saveUninitialized: true,
    cookie: { secure: process.env.NODE_ENV === 'production' } // Set secure cookie only in production
}));

// Database connection
const db = new sqlite3.Database('./recruitment.db', (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log('Connected to the recruitment database.');
    }
});

// Middleware to check if the user is authenticated
function checkAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    next();
}

// Middleware to prevent browser caching of sensitive pages
function preventCache(req, res, next) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
}

// Home route (redirects to login page)
app.get('/', (req, res) => {
    res.redirect('/login');
});

// Login route
app.get('/login', (req, res) => {
    const error = req.query.error || null;
    res.render('login', { error });
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
        if (err) {
            console.error(err.message);
            return res.render('login', { error: 'Database error' });
        }
        if (user) {
            bcrypt.compare(password, user.password, (err, result) => {
                if (result) {
                    req.session.user = user.id;
                    return res.redirect('/dashboard');
                } else {
                    return res.render('login', { error: 'Incorrect password' });
                }
            });
        } else {
            return res.render('login', { error: 'No account found with these credentials' });
        }
    });
});

// Registration route
app.get('/register', (req, res) => {
    const error = req.query.error || null;
    res.render('register', { error });
});

app.post('/register', async(req, res) => {
    const { username, password } = req.body;

    db.get('SELECT * FROM users WHERE username = ?', [username], async(err, user) => {
        if (err) {
            console.error("Database error:", err.message);
            return res.redirect('/register?error=Database error');
        }

        if (user) {
            return res.redirect('/register?error=Username already taken');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword], function(err) {
            if (err) {
                console.error("Error inserting user:", err.message);
                return res.redirect('/register?error=Error inserting user');
            }
            res.redirect('/login');
        });
    });
});

// Dashboard route (protected)
app.get('/dashboard', checkAuth, preventCache, (req, res) => {
    db.all('SELECT * FROM companies WHERE user_id = ?', [req.session.user], (err, companies) => {
        if (err) {
            console.error("Database error:", err.message);
            return res.redirect('/login');
        }
        res.render('dashboard', { companies });
    });
});

// Route to render the 'add' form
app.get('/add', checkAuth, preventCache, (req, res) => {
    const error = req.query.error || null;
    res.render('add', { error });
});

app.post('/add', checkAuth, (req, res) => {
    const { companyName, talkDate, assessmentDate, assessmentWebsite, interviewDate, status } = req.body;

    const [talk_date, talk_time] = talkDate ? talkDate.split('T') : [null, null];
    const [assessment_date, assessment_time] = assessmentDate ? assessmentDate.split('T') : [null, null];
    const [interview_date, interview_time] = interviewDate ? interviewDate.split('T') : [null, null];

    db.run(`INSERT INTO companies (company_name, pre_placement_talk, pre_placement_time, assessment_date, assessment_time, assessment_website, interview_date, interview_time, status, user_id) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [companyName, talk_date, talk_time, assessment_date, assessment_time, assessmentWebsite, interview_date, interview_time, status, req.session.user],
        function(err) {
            if (err) {
                console.error("Error inserting data:", err.message);
                return res.redirect('/add?error=Error inserting data');
            }
            res.redirect('/dashboard');
        });
});

// Route to render the 'edit' form
app.get('/edit/:id', checkAuth, preventCache, (req, res) => {
    const id = req.params.id;
    const user_id = req.session.user;

    db.get('SELECT * FROM companies WHERE id = ? AND user_id = ?', [id, user_id], (err, company) => {
        if (err) {
            console.error(err.message);
            return res.redirect('/dashboard');
        }
        if (company) {
            res.render('editCompany', { company, error: null });
        } else {
            res.redirect('/dashboard');
        }
    });
});

// Route to handle the form submission (POST request)
app.post('/edit/:id', checkAuth, (req, res) => {
    const { companyName, talkDate, assessmentDate, assessmentWebsite, interviewDate, status } = req.body;
    const id = req.params.id;
    const user_id = req.session.user;

    const [talk_date, talk_time] = talkDate.split('T');
    const [assessment_date, assessment_time] = assessmentDate.split('T');
    const [interview_date, interview_time] = interviewDate ? interviewDate.split('T') : [null, null];

    db.run(`UPDATE companies SET company_name = ?, pre_placement_talk = ?, pre_placement_time = ?, assessment_date = ?, assessment_time = ?, assessment_website = ?, interview_date = ?, interview_time = ?, status = ? WHERE id = ? AND user_id = ?`, [companyName, talk_date, talk_time, assessment_date, assessment_time, assessmentWebsite, interview_date, interview_time, status, id, user_id],
        function(err) {
            if (err) {
                console.error("Error updating data:", err.message);
                return res.render('editCompany', {
                    company: {
                        id,
                        companyName,
                        talkDate,
                        assessmentDate,
                        assessmentWebsite,
                        interviewDate,
                        status
                    },
                    error: 'Error updating data'
                });
            }
            res.redirect('/dashboard');
        });
});

// Delete route
app.get('/delete/:id', checkAuth, (req, res) => {
    const id = req.params.id;
    const user_id = req.session.user;
    db.run('DELETE FROM companies WHERE id = ? AND user_id = ?', [id, user_id], (err) => {
        if (err) {
            console.error(err.message);
        }
        res.redirect('/dashboard');
    });
});

// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.redirect('/dashboard');
        }
        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

// Download PDF route
app.get('/download', checkAuth, preventCache, (req, res) => {
    const doc = new PDFDocument();
    res.setHeader('Content-disposition', 'attachment; filename=companies.pdf');
    res.setHeader('Content-type', 'application/pdf');

    db.all('SELECT * FROM companies WHERE user_id = ? ORDER BY assessment_date', [req.session.user], (err, companies) => {
        if (err) {
            console.error(err.message);
            return res.redirect('/dashboard');
        }

        doc.fontSize(12).text('Company Recruitment Information', { align: 'center' });
        companies.forEach(company => {
            doc.moveDown();
            doc.text(`Company: ${company.company_name || 'N/A'}`);
            doc.text(`Pre Placement Talk: ${company.pre_placement_talk || 'N/A'} at ${company.pre_placement_time || 'N/A'}`);
            doc.text(`Assessment: ${company.assessment_date || 'N/A'} at ${company.assessment_time || 'N/A'}`);
            doc.text(`Interview: ${company.interview_date || 'N/A'} at ${company.interview_time || 'N/A'}`);
            doc.text(`Status: ${company.status}`);
        });

        doc.pipe(res);
        doc.end();
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});